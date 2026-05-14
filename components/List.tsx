export const List = ({ items }: { items: { label: string; value: any; hidden?: boolean }[] }) => {
  return (
    <div>
      <div className="mt-2 border-t border-gray-100">
        <dl className="divide-y divide-gray-100">
          {items.filter(i => !i.hidden).map(item => (
            <div key={item.label} className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900">{item.label}</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};
