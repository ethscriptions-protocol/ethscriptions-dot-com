import Link from "next/link";
import type { GetStaticProps, NextPage } from "next";
import { Card } from "~~/components/Card";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import type { CollectionListItem } from "~~/lib/collections";

export const getStaticProps: GetStaticProps<{ collections: CollectionListItem[] }> = async () => {
  const { listDownloadedCollections } = await import("../../lib/loadCollections");
  return { props: { collections: listDownloadedCollections() }, revalidate: 60 };
};

const Collections: NextPage<{ collections: CollectionListItem[] }> = ({ collections }) => {
  return (
    <>
      <MetaTags collection={{ name: "Collections", description: "Ethscriptions Collections" }} />

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h1">Collections</Heading>
          <Card className="gap-4">
            {collections.length === 0 ? (
              <p className="px-6 py-8 text-base text-gray-600">No collections have been snapshotted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b">
                    <tr>
                      <th className="px-6 py-2 text-gray-600 text-sm font-normal" />
                      <th className="px-6 py-2 text-gray-600 text-sm font-normal">Collection</th>
                      <th className="px-6 py-2 text-gray-600 text-sm font-normal">Supply</th>
                      <th className="px-6 py-2 text-gray-600 text-sm font-normal">Holders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map(c => (
                      <tr key={c.slug} className="border-b">
                        <td className="px-6 py-2">
                          <Link
                            href={`/collections/${c.slug}`}
                            className="block w-16 h-16 rounded overflow-hidden bg-gray-100"
                          >
                            {c.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.image}
                                alt=""
                                className="w-full h-full object-cover"
                                style={{ imageRendering: "pixelated" }}
                              />
                            )}
                          </Link>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap">
                          <Link href={`/collections/${c.slug}`} className="text-base font-medium hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-base">
                          {c.supply != null ? c.supply.toLocaleString() : "—"}
                        </td>
                        <td className="px-6 py-2 whitespace-nowrap text-base">
                          {c.holders != null ? c.holders.toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Section>
      </SectionContainer>
    </>
  );
};

export default Collections;
