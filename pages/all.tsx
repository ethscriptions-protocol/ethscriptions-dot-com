import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
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

const About: NextPage = () => {
  const router = useRouter();
  const attachmentPresent = router.query.attachment_present === "true";

  const [data, setData] = useState<Ethscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [initialFetchDone, setInitialFetchDone] = useState(false);

  // Reset accumulated state when the filter changes so the next fetch starts fresh.
  useEffect(() => {
    setData([]);
    setPageKey(null);
    setHasMore(true);
    setInitialFetchDone(false);
  }, [attachmentPresent]);

  const fetchData = useCallback(async () => {
    if (!loading && hasMore && router.isReady) {
      setLoading(true);
      const params: Record<string, string> = {};
      if (pageKey) params.page_key = pageKey;
      if (attachmentPresent) params.attachment_present = "true";

      const response = await axios.get(v2("ethscriptions"), { params });
      setData(prev => uniqBy([...prev, ...response.data.result], "transaction_hash"));
      setPageKey(response.data.pagination.page_key);
      setHasMore(response.data.pagination.has_more);
      setLoading(false);
      setInitialFetchDone(true);
    }
  }, [loading, hasMore, pageKey, router.isReady, attachmentPresent]);

  useEffect(() => {
    if (initialFetchDone) return;
    if (!router.isReady) return;
    fetchData();
  }, [initialFetchDone, fetchData, router.isReady]);

  const EthscriptionInfo = {
    name: "All Ethscriptions",
    description: "All Ethscriptions",
  };

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h1">Recent</Heading>
          <InfiniteScroll
            dataLength={data.length}
            next={() => fetchData()}
            hasMore={hasMore}
            loader={<p>Loading...</p>}
            className="!overflow-visible"
          >
            <Grid>
              {data.map(ethscription => (
                <EthscriptionItem key={ethscription.transaction_hash} ethscription={ethscription} />
              ))}
            </Grid>
          </InfiniteScroll>
        </Section>
      </SectionContainer>
    </>
  );
};

export default About;
