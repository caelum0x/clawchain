import React from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import Head from "next/head";

import Stake from "components/pages/Stake";
import { useClawDEX } from "modules/common";

const StakePage: NextPage = () => {
  const { query } = useRouter();
  const { pools } = useClawDEX();

  const pool =
    pools &&
    pools.find(({ pool_address }) => {
      return query["pool"] === pool_address;
    });

  return (
    <>
      <Head>
        <title>ClawDEX</title>
      </Head>
      {pool != null && <Stake pool={pool} />}
    </>
  );
};

export default StakePage;
