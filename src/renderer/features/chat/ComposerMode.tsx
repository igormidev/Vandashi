import { Eye, ListChecks, PencilLine, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChoiceMenu } from './ChoiceMenu';

export function ComposerMode({
  mode,
  plan,
  installation,
  canPlan,
  disabled,
  onChange,
}: {
  mode: 'read' | 'edit';
  plan: boolean;
  installation: boolean;
  canPlan: boolean;
  disabled: boolean;
  onChange: (value: 'plan' | 'read' | 'edit') => void;
}) {
  const { t } = useTranslation();
  const options = [
    {
      value: 'plan',
      label: t('chatPlanMode'),
      icon: <ListChecks className="selection-icon" size={16} aria-hidden="true" />,
    },
    {
      value: 'read',
      label: t('readMode'),
      icon: <Eye className="selection-icon" size={16} aria-hidden="true" />,
    },
    {
      value: 'edit',
      label: t(installation ? 'installationMode' : 'editMode'),
      icon: installation ? (
        <Wrench className="selection-icon" size={16} aria-hidden="true" />
      ) : (
        <PencilLine className="selection-icon" size={16} aria-hidden="true" />
      ),
    },
  ];
  return (
    <ChoiceMenu
      className="mode-choice"
      label={t(
        plan ? 'chatPlanMode' : mode === 'read' ? 'readMode' : installation ? 'installationMode' : 'editMode',
      )}
      value={plan ? 'plan' : mode}
      options={options.filter((option) => option.value !== 'plan' || canPlan)}
      disabled={disabled}
      onChange={(value) => {
        if (value === 'plan' || value === 'read' || value === 'edit') onChange(value);
      }}
    />
  );
}
