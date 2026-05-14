import { parseDataURI } from "~~/utils/parsers";

interface Props {
  contentURI: string;
}

export const EthscriptionJSON = ({ contentURI }: Props) => {
  const { isBase64, data } = parseDataURI(contentURI);

  let contentData = data;

  if (!contentData) {
    contentData = contentURI;
  }

  let jsonData = isBase64 ? Buffer.from(contentData, "base64").toString() : contentData;
  let isJson = false;
  try {
    jsonData = JSON.stringify(JSON.parse(isBase64 ? atob(contentData) : contentData), undefined, 2);
    isJson = true;
  } catch (e) {}

  return (
    <pre
      className={`w-full font-mono aspect-square p-6 bg-gray-200 place-items-center whitspace-pre whitespace-pre-wrap
    ${isJson ? "" : "flex justify-center items-center"}
    
    break-all overflow-x-auto overflow-y-hidden `}
    >
      {jsonData}
    </pre>
  );
};
