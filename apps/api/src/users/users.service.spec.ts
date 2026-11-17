import { displayNameOf } from './users.service';

describe('displayNameOf', () => {
  it('shows first name and last initial by default', () => {
    expect(displayNameOf('Nour El-Sayed', false)).toBe('Nour E.');
    expect(displayNameOf('Karim Ahmed Mostafa', false)).toBe('Karim M.');
  });
  it('shows the full name when the user opted in', () => {
    expect(displayNameOf('Nour El-Sayed', true)).toBe('Nour El-Sayed');
  });
  it('handles single names and Arabic', () => {
    expect(displayNameOf('Nour', false)).toBe('Nour');
    expect(displayNameOf('نور السيد', false)).toBe('نور س.');
  });
});
