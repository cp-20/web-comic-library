type RadioOption = Readonly<{
  label: string;
  value: string;
}>;

type RadioGroupProps = Readonly<{
  defaultValue?: string;
  legend: string;
  name: string;
  options: readonly RadioOption[];
}>;

export const RadioGroup = ({ defaultValue, legend, name, options }: RadioGroupProps) => {
  return (
    <fieldset className="grid gap-2">
      <legend className="font-medium">{legend}</legend>
      <div className="grid gap-1">
        {options.map((option) => (
          <label className="flex min-h-11 items-center gap-2" key={option.value}>
            <input
              className="size-5 shrink-0 accent-accent"
              defaultChecked={option.value === defaultValue}
              name={name}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};
