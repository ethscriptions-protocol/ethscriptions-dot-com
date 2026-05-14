interface Props {
  contentURI: string;
}

export const EthscriptionHTML = ({ contentURI }: Props) => {
  return <iframe loading="lazy" className="w-full aspect-square" src={contentURI} sandbox="allow-scripts"></iframe>;
};
