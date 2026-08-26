export default function SearchField({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <input
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="h-11 w-full min-w-0 rounded-xl border border-admin-border-strong bg-white px-4 text-sm text-admin-ink outline-none focus:border-admin-ink"
    />
  );
}
