type PageHeaderProps = Readonly<{
  description?: string;
  title: string;
}>;

export const PageHeader = ({ description, title }: PageHeaderProps) => {
  return (
    <div className="grid gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description ? <p className="text-text-muted">{description}</p> : null}
    </div>
  );
};
