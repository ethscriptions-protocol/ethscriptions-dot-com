import { formatDistanceToNowStrict, parseISO } from "date-fns";

export const formatTimestamp = (dateStr: string) => {
  if (!dateStr) return null;

  const targetDate = parseISO(dateStr);
  const timeAgo = formatDistanceToNowStrict(targetDate, { roundingMethod: "floor" });

  return `${timeAgo} ago`;
};

export const truncateMiddle = (str: string, frontLength: number, backLength: number) => {
  if (str.length <= frontLength + backLength + 3) {
    return str;
  }

  const frontStr = str.substr(0, frontLength);
  const backStr = str.substr(str.length - backLength);
  return `${frontStr}...${backStr}`;
};
