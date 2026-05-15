import React, { useState } from "react";
import { AppProps } from "next/app";
import Head from "next/head";
import { QueryClientProvider, QueryClient } from "react-query";
import { Hydrate } from "react-query/hydration";
import { ChakraProvider, CSSReset } from "@chakra-ui/react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import advancedFormat from "dayjs/plugin/advancedFormat";
import useLocalStorage from "hooks/useLocalStorage";
import Layout from "components/Layout";
import ClawDEXDisclaimer from "components/pages/Disclaimer";
import { KeplrWalletProvider } from "context/KeplrWalletContext";
import theme from "../theme";

dayjs.extend(timezone);
dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);
dayjs.extend(advancedFormat);
dayjs.extend(utc);

const MyApp = ({ Component, pageProps }: AppProps) => {
  const [termsAgreed, setTermsAgreed] = useLocalStorage(
    "accepted_terms_conditions",
    false
  );
  const [showingDisclaimer, setShowingDisclaimer] = useState(
    () => !termsAgreed
  );
  const [queryClient] = useState(() => new QueryClient());

  return (
    <KeplrWalletProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <link rel="shortcut icon" href="/favicon.png" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <Hydrate state={pageProps.dehydratedState}>
          <ChakraProvider theme={theme}>
            <CSSReset />
            <Layout>
              {showingDisclaimer ? (
                <ClawDEXDisclaimer
                  onConfirmClick={() => {
                    setTermsAgreed(true);
                    setShowingDisclaimer(false);
                  }}
                />
              ) : (
                <Component {...pageProps} />
              )}
            </Layout>
          </ChakraProvider>
        </Hydrate>
      </QueryClientProvider>
    </KeplrWalletProvider>
  );
};

export default MyApp;
