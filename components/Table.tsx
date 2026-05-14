export const Table = ({
  headers,
  rows,
  onRowClick,
}: {
  headers: (JSX.Element | string)[] | (JSX.Element | string)[][];
  rows: (JSX.Element | string)[][] | (JSX.Element | string)[][];
  onRowClick?: (index: number) => void;
}) => {
  return (
    <div className="overflow-x-auto sm:-mx-6 lg:-mx-8">
      <div className="inline-block min-w-full py-2 sm:px-6 lg:px-8">
        <div className="overflow-hidden">
          <table className="min-w-full text-left">
            <thead className="border-b dark:border-neutral-500">
              <tr>
                {headers.map((header, i) => (
                  <th key={i} scope="col" className="px-6 py-4 whitespace-nowrap text-gray-600 text-sm font-normal">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b dark:border-neutral-500 ${onRowClick ? "cursor-pointer hover:bg-gray-100" : ""}`}
                  onClick={() => onRowClick && onRowClick(ri)}
                >
                  {row.map((col, ci) => (
                    <td key={`${ri}-${ci}`} className="whitespace-nowrap px-6 py-4">
                      {col}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
