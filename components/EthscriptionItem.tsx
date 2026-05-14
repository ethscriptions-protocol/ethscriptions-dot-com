import Link from "next/link";
import { EthscriptionRenderer } from "./EthscriptionRenderer";
import { Heading } from "./Heading";
import { Ethscription } from "~~/types/ethscriptions";
import { formatTimestamp } from "~~/utils/formatter";

export const EthscriptionItem = ({
  ethscription,
  name,
  backgroundColor,
}: {
  ethscription: Ethscription;
  name?: string;
  backgroundColor?: string | null;
}) => {
  return (
    <Link href={`/ethscriptions/${ethscription.transaction_hash}`}>
      <div className="flex bg-white flex-col items-start justify-start gap-4 tracking-tight w-full h-full shadow-sm rounded-xl overflow-hidden">
        <div className="flex flex-col gap-1 w-full h-full text-lg justify-between relative">
          <div className="w-full overflow-hidden">
            <div
              className="aspect-square hover:scale-[1.1] transition duration-300"
              style={{ backgroundColor: backgroundColor || undefined }}
            >
              <div className="pointer-events-none">
                <EthscriptionRenderer
                  hash={ethscription.transaction_hash}
                  contentURI={ethscription.content_uri}
                  mimetype={ethscription.mimetype}
                  attachmentPath={ethscription.attachment_path}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 p-4">
            {name ? (
              <Heading size="h6">{name}</Heading>
            ) : (
              <Heading size="h6">
                {`Ethscription ${!!ethscription.ethscription_number ? ` #${ethscription.ethscription_number}` : ""}`}
              </Heading>
            )}
            <div className="text-xs text-gray-500">
              Created {formatTimestamp(new Date(parseInt(ethscription.block_timestamp) * 1000).toISOString())}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};
