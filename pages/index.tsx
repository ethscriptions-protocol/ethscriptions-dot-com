import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { uniqBy } from "lodash";
import type { NextPage } from "next";
import InfiniteScroll from "react-infinite-scroll-component";
import { EthscriptionItem } from "~~/components/EthscriptionItem";
import { Grid } from "~~/components/Grid";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";
import { Ethscription } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";

const Home: NextPage = () => {
  const [recent, setRecent] = useState<Ethscription[]>([]);
  const [pageKey, setPageKey] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  const fetchRecent = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const params: any = {
        mimetype: "image/png",
        sort_by: "newest_first",
        max_results: 32,
      };
      if (pageKey) params.page_key = pageKey;

      const response = await axios.get(v2("ethscriptions"), { params });
      const items = (response.data.result ?? []) as Ethscription[];
      setRecent(prev => uniqBy([...prev, ...items], "transaction_hash"));
      setPageKey(response.data.pagination?.page_key);
      setHasMore(!!response.data.pagination?.has_more);
      setInitialFetchDone(true);
    } finally {
      setLoading(false);
    }
  }, [loading, pageKey]);

  useEffect(() => {
    if (!initialFetchDone) fetchRecent();
  }, [initialFetchDone, fetchRecent]);

  const EthscriptionInfo = {
    name: "Ethscriptions",
    description: "Create, browse, and collect inscriptions stored in Ethereum calldata.",
  };

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h2">Recent Ethscriptions</Heading>
          <InfiniteScroll
            dataLength={recent.length}
            next={() => fetchRecent()}
            hasMore={hasMore}
            loader={<p>Loading...</p>}
            className="!overflow-visible"
          >
            <Grid>
              {recent.map(ethscription => (
                <EthscriptionItem key={ethscription.transaction_hash} ethscription={ethscription} />
              ))}
            </Grid>
          </InfiniteScroll>
        </Section>
      </SectionContainer>
    </>
  );
};

export default Home;
