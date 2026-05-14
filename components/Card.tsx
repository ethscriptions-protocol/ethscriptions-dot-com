import clsx from "clsx";

export const Card = ({ children, className, style }: { children: any | any[]; className?: string; style?: any }) => {
  return (
    <div className={clsx("flex flex-col p-8 bg-white rounded-2xl shadow-sm", className)} style={style}>
      {children}
    </div>
  );
};
