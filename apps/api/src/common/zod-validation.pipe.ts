import { Injectable, PipeTransform } from '@nestjs/common';
import { isErrorCode, type ErrorCode } from '@wasla/shared';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './app-exception';

/**
 * Validates a request part against a shared Zod schema. Unknown keys are
 * stripped (Zod's default), so clients cannot smuggle fields such as `roles`.
 * Field errors are reported as error codes so apps can localize them.
 */
@Injectable()
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;

    const fields: Record<string, ErrorCode> = {};
    let topCode: ErrorCode | undefined;
    for (const issue of result.error.issues) {
      const code: ErrorCode = isErrorCode(issue.message) ? issue.message : 'VALIDATION_FAILED';
      const path = issue.path.join('.') || '_';
      fields[path] ??= code;
      topCode ??= code;
    }
    // A single domain-specific problem (e.g. invalid phone) becomes the main code.
    const codes = new Set(Object.values(fields));
    throw badRequest(codes.size === 1 && topCode ? topCode : 'VALIDATION_FAILED', fields);
  }
}
