import React from "react";
import Head from "next/head";
import { NextPage } from "next";

import GovStake from "components/pages/GovStake";

const GovernancePage: NextPage = () => {
  return (
    <>
      <Head>
        <title>ClawDEX</title>
      </Head>
      <GovStake />
    </>
  );
};

export default GovernancePage;
