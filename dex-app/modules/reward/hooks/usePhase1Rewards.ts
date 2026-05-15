import { useMemo } from "react";
import num from "libs/num";

import { useUserInfo } from "modules/lockdrop";
import { ONE_TOKEN } from "constants/constants";

export const usePhase1Rewards = () => {
  const userInfo = useUserInfo();

  return useMemo(() => {
    if (userInfo == null) {
      return 0;
    }

    if (userInfo.claw_transferred) {
      return 0;
    }

    return num(userInfo.total_claw_rewards)
      .minus(userInfo.delegated_claw_rewards)
      .div(ONE_TOKEN)
      .dp(6)
      .toNumber();
  }, [userInfo]);
};

export default usePhase1Rewards;
