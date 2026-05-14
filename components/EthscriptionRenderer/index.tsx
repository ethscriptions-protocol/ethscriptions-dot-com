import { useMemo, useEffect, useState } from "react";
import { EthscriptionHTML } from "./EthscriptionHTML";
import { EthscriptionImage } from "./EthscriptionImage";
import { EthscriptionJSON } from "./EthscriptionJSON";
import axios from "axios";
import takedowns from "~~/data/takedowns.json";
import { v2 } from "~~/utils/escUrl";

// takedowns.json stores a base64-encoded 16-byte prefix of each blocked transaction_hash
// (i.e. the first 32 hex chars after "0x"). 128 bits of entropy → collision probability
// for ~40k entries is ~10^-30. Halves the bundle vs. storing full hex hashes.
const blockedSet = new Set(takedowns.blocked ?? []);

const isBlockedHash = (hash: string): boolean => {
  // Re-encode the input hash the same way: take first 32 hex chars after "0x",
  // hex-decode to 16 bytes, base64-encode (no padding).
  const hex = hash.toLowerCase();
  if (!hex.startsWith("0x") || hex.length < 34) return false;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  let bin = "";
  for (let i = 0; i < 16; i++) bin += String.fromCharCode(bytes[i]);
  return blockedSet.has(btoa(bin).replace(/=+$/, ""));
};

interface Props {
  hash?: string;
  mimetype?: string;
  contentURI: string;
  attachmentPath?: string;
}

export const EthscriptionRenderer = ({ hash, mimetype, contentURI, attachmentPath }: Props) => {
  const removed = hash ? isBlockedHash(hash) : false;
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const [attachmentContent, setAttachmentContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const attachmentUrl = useMemo(() => v2(`ethscriptions/${hash}/attachment`), [hash]);
  
  const dataMimeType = useMemo(() => {
    return mimetype || contentURI.substring(contentURI.indexOf(":") + 1, contentURI.indexOf(";"));
  }, [mimetype, contentURI]);
  
  function isTextMimetype(mimetype: string) {
    return mimetype.startsWith('text/') || mimetype.startsWith('application/json')
  }

  useEffect(() => {
    const fetchContent = async () => {
      if (!attachmentPath) return;
      setLoading(true);

      try {
        const response = await axios.get(attachmentUrl, { responseType: 'blob' });
        const contentType = String(response.headers['content-type'] ?? '');
        setAttachmentMimeType(contentType);

        if (isTextMimetype(contentType)) {
          let textContent = await response.data.text();
          
          try {
            textContent = JSON.stringify(JSON.parse(textContent), undefined, 2);
          } catch (e) {}
          
          setAttachmentContent(textContent);
        }
        setLoading(false);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.log('Content not found, retrying...');
          setTimeout(fetchContent, 12000); // Retry after 12 seconds
        } else {
          console.error("Failed to fetch content", error);
          setLoading(false);
        }
      }
    };

    fetchContent();
  }, [attachmentPath, attachmentUrl]);
  
  if (!dataMimeType) {
    throw new Error("Mimetype could not be determined");
  }

  const renderContent = () => {
    if (removed) {
      return (
        <div className="w-full select-none font-mono aspect-square p-4 text-xs place-items-center whitspace-pre whitespace-pre-wrap flex justify-center items-center break-all overflow-x-auto overflow-y-hidden">
          removed by request of rights holder
        </div>
      );
    }
    
    if (loading) {
      return <div
      className="grid w-full aspect-square p-6 bg-gray-200 place-items-center"
      >Loading...</div>;
    }
    
    if (attachmentMimeType) {
      if (attachmentMimeType.startsWith('image/')) {
        return <EthscriptionImage ethscriptionHash={hash} contentURI={attachmentUrl} />;
      } else if (attachmentMimeType.startsWith('video/')) {
        return <video className="w-full aspect-square" src={attachmentUrl} controls />;
      } else if (isTextMimetype(attachmentMimeType) && attachmentContent) {
        return <pre
          className={`grid w-full font-mono aspect-square p-6 bg-gray-200 place-items-center whitspace-pre whitespace-pre-wrap justify-center items-center
          break-all overflow-x-auto overflow-y-hidden`}
        >
        {attachmentContent}
      </pre>;
      }
    }

    switch (dataMimeType) {
      case dataMimeType.startsWith("image/") ? dataMimeType : "":
        return <EthscriptionImage ethscriptionHash={hash} contentURI={contentURI} />;
      case "text/html":
        return <EthscriptionHTML contentURI={contentURI} />;
      case "application/json":
      default:
        return <EthscriptionJSON contentURI={contentURI} />;
    }
  };

  return renderContent();
};
