import startCase from "lodash/startCase";
import type { CollectionTrait } from "~~/lib/collections";

export const CollectionAttributes = ({ traits }: { traits: CollectionTrait[] }) => {
  if (!traits.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {traits.map(attr => (
        <div key={`${attr.trait_type}:${attr.value}`} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <div className="text-xs text-gray-500">{startCase(attr.trait_type)}</div>
          <div className="font-medium">{attr.value}</div>
        </div>
      ))}
    </div>
  );
};
