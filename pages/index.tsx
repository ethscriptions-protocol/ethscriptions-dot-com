import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { endpoints } from "~~/lib/endpoints";
import { Ethscription } from "~~/types/ethscriptions";
import { v2 } from "~~/utils/escUrl";

const STATS_CACHE_KEY = "esc-home-stats-v1";
const STATS_CACHE_TTL_MS = 10 * 60 * 1000;
const STATS_TOKEN_URL = `${endpoints.explorer}/api/v2/tokens/0x3300000000000000000000000000000000000001`;

type Stats = { supply: number; holders: number };

function readStatsCache(): Stats | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > STATS_CACHE_TTL_MS) return null;
    return { supply: parsed.supply, holders: parsed.holders };
  } catch {
    return null;
  }
}

function writeStatsCache(s: Stats) {
  try {
    sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ...s, ts: Date.now() }));
  } catch {}
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const Home: NextPage = () => {
  const [recent, setRecent] = useState<Ethscription[]>([]);
  const [pageKey, setPageKey] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const cached = readStatsCache();
    if (cached) {
      setStats(cached);
      return;
    }
    let cancelled = false;
    axios
      .get(STATS_TOKEN_URL)
      .then(r => {
        if (cancelled) return;
        const supply = parseInt(r.data?.total_supply, 10);
        const holders = parseInt(r.data?.holders_count, 10);
        if (Number.isFinite(supply) && Number.isFinite(holders)) {
          const next = { supply, holders };
          setStats(next);
          writeStatsCache(next);
        }
      })
      .catch(err => {
        console.warn("Failed to load homepage stats:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    description:
      "Ethscriptions is an EVM blockchain derived from Ethereum calldata. Same data, same ownership, now with blocks, state roots, and ZK proofs.",
  };

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />

      <div style={{ background: "linear-gradient(to bottom, #1a1a1a, #0d0d0d)" }}>
        <SectionContainer className="py-16 md:py-24">
          <Section className="gap-8 items-center text-center">
            <div className="max-w-3xl mx-auto flex flex-col gap-6">
              <Heading size="h1" className="text-4xl md:text-5xl lg:text-6xl text-[#E5E5E5]">
                Introducing the Stage 2 Ethscriptions AppChain
              </Heading>
              <p className="text-lg md:text-xl text-[#999999] leading-relaxed">
                Every ethscription ever created is now represented on a full EVM chain with blocks, state roots, and
                receipts. Prove ownership to Ethereum L1 with ZK proofs.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-8 md:gap-16 mt-4">
              <div className="flex flex-col items-center">
                <span className="text-3xl md:text-4xl font-black text-[#c3ff00]">
                  {stats ? formatCompact(stats.supply) : "—"}
                </span>
                <span className="text-sm text-[#888888]">ethscriptions</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-3xl md:text-4xl font-black text-[#c3ff00]">
                  {stats ? formatCompact(stats.holders) : "—"}
                </span>
                <span className="text-sm text-[#888888]">unique holders</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-3xl md:text-4xl font-black font-mono text-[#c3ff00]">0xeeee</span>
                <span className="text-sm text-[#888888]">chain ID</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 mt-4">
              <a
                href="https://x.com/dumbnamenumbers/status/2011117420174316023"
                className="btn btn-lg border-0 text-black font-bold"
                style={{ backgroundColor: "#c3ff00" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the Announcement
              </a>
              <a
                href={endpoints.explorer}
                className="btn btn-lg bg-transparent font-bold text-[#E5E5E5]"
                style={{ borderColor: "#c3ff00" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explore the Chain
              </a>
              <a
                href={`${endpoints.docs}/ethscriptions-appchain/overview`}
                className="btn btn-lg bg-transparent font-bold text-[#E5E5E5]"
                style={{ borderColor: "#c3ff00" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the Docs
              </a>
            </div>
          </Section>
        </SectionContainer>
      </div>

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h2">Recent</Heading>
          <p className="text-sm text-gray-500 -mt-6">
            Buying and selling ethscriptions through this website has been sunset.{" "}
            <Link href="/marketplace-withdraw" className="underline hover:text-black">
            Learn more and withdraw →
            </Link>
          </p>
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
