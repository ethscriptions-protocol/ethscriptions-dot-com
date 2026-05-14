interface Props {
  ethscriptionHash?: string;
  contentURI: string;
}

export const EthscriptionImage = ({ ethscriptionHash, contentURI }: Props) => {
  return (
    <img
      alt={ethscriptionHash}
      className="w-full aspect-square object-contain"
      style={{ imageRendering: "pixelated" }}
      src={contentURI}
    />
  );
};
