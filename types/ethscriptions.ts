export interface Transfer {
  ethscription_transaction_hash: string;
  transaction_hash: string;
  from_address: string;
  to_address: string;
  block_number: string;
  block_timestamp: string;
  block_blockhash: string;
  transfer_index: string;
  transaction_index: string;
}

export interface Ethscription {
  transaction_hash: string;
  block_number: string;
  transaction_index: string;
  block_timestamp: string;
  block_blockhash: string;
  ethscription_number: string | null;
  creator: string;
  initial_owner: string;
  current_owner: string;
  previous_owner: string;
  content_uri: string;
  content_sha: string;
  esip6: boolean;
  mimetype: string;
  media_type: string;
  mime_subtype: string;
  attachment_sha: string | null;
  attachment_content_type: string | null;
  attachment_path?: string;
  b64_content?: string;
  ethscription_transfers?: Transfer[];
}
