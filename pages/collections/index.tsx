import type { NextPage } from "next";
import { Card } from "~~/components/Card";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import collections from "~~/data/collections.json";
import { endpoints } from "~~/lib/endpoints";

const BLOCKSCOUT_TOKEN = `${endpoints.explorer}/token`;

const sorted = [...collections].sort((a, b) => {
  const ah = a.holders ? parseInt(a.holders) : -1;
  const bh = b.holders ? parseInt(b.holders) : -1;
  return bh - ah;
});

const Collections: NextPage = () => {
  return (
    <>
      <MetaTags collection={{ name: "Collections", description: "Ethscriptions Collections" }} />

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h1">Collections</Heading>
          <Card className="gap-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="border-b">
                  <tr>
                    <th className="px-6 py-2 text-gray-600 text-sm font-normal" />
                    <th className="px-6 py-2 text-gray-600 text-sm font-normal">Collection</th>
                    <th className="px-6 py-2 text-gray-600 text-sm font-normal">Supply</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(c => (
                    <tr key={c.name} className="border-b">
                      <td className="px-6 py-2">
                        <div className="w-16 h-16 rounded overflow-hidden bg-gray-100">
                          {c.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.image}
                              alt=""
                              className="w-full h-full object-cover"
                              style={{ imageRendering: "pixelated" }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        {c.address ? (
                          <a
                            href={`${BLOCKSCOUT_TOKEN}/${c.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-base font-medium hover:underline"
                          >
                            {c.name}
                          </a>
                        ) : (
                          <span className="text-base font-medium text-gray-400">{c.name}</span>
                        )}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-base">
                        {c.supply ? Number(c.supply).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>
      </SectionContainer>
    </>
  );
};

export default Collections;
