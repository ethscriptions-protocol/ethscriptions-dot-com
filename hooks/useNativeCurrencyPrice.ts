import { useEffect, useState } from "react";
import { fetchPriceFromUniswap } from "~~/utils/fetchPriceFromUniswap";

export const useNativeCurrencyPrice = () => {
  const [nativeCurrencyPrice, setNativeCurrencyPrice] = useState(0);

  useEffect(() => {
    (async () => {
      const price = await fetchPriceFromUniswap();
      setNativeCurrencyPrice(price);
    })();
  }, []);

  return nativeCurrencyPrice;
};
