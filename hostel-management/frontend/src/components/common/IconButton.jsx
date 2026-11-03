/** Small icon-only action button for table rows. */
export default function IconButton({ icon: Icon, label, onClick, tone = 'slate', disabled, as: As = 'button', ...props }) {
  const tones = {
    slate: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    brand: 'text-brand-700 hover:bg-brand-50',
    red: 'text-red-600 hover:bg-red-50',
  };
  return (
    <As
      type={As === 'button' ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${tones[tone]}`}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </As>
  );
}
