import clsx from "clsx";

export const SectionContainer = ({ children, className }: { children: any | any[]; className?: string }) => {
  return <div className={clsx("flex flex-col w-full items-center py-8 px-4 gap-8", className)}>{children}</div>;
};
