import { useEffect, useState } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import NextNProgress from "nextjs-progressbar";
import { Toaster } from "react-hot-toast";
import { useDarkMode } from "usehooks-ts";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/wallet";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import "~~/styles/globals.css";

const queryClient = new QueryClient();

const App = ({ Component, pageProps }: AppProps) => {
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { isDarkMode } = useDarkMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsDarkTheme(isDarkMode);
  }, [isDarkMode]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NextNProgress />
        <RainbowKitProvider
          avatar={BlockieAvatar}
          modalSize="compact"
          theme={mounted && !isDarkTheme ? lightTheme() : darkTheme()}
        >
          <div className="flex flex-col min-h-screen">
            <Head>
              <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
            </Head>
            <Header />
            <main className="relative flex flex-col flex-1">
              <Component {...pageProps} />
              {process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true" && <Analytics />}
            </main>
            <Footer />
          </div>
          <Toaster />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
