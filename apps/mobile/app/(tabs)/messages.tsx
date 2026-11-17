import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../src/components/ComingSoon';

export default function Messages() {
  const { t } = useTranslation();
  return <ComingSoon title={t('tabs.messages')} body={t('comingSoon.messages')} icon="chat" />;
}
