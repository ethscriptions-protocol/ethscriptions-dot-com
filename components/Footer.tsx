export const Footer = () => {
  return (
    <div className="p-4 pt-8 pb-8 md:pl-8 text-gray-50 bg-night min-h-[300px] flex flex-col">
      <div className="w-full h-full flex flex-col gap-6 flex-1">
        <div className="text-4xl font-bold">
          Get in touch
        </div>
        <div className="w-full flex gap-8 flex-wrap md:gap-24">
          <div className="flex flex-col gap-2">
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              href="https://discord.gg/ethscriptions">
                Ethscriptions Discord
            </a>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              href="https://twitter.com/dumbnamenumbers">
                Middlemarch on Twitter
            </a>
          </div>
          <div className="flex flex-col gap-2 flex-wrap">
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              href="https://github.com/ethscriptions-protocol/ethscriptions-dot-com">
                Website source on GitHub
            </a>
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              href="https://github.com/ethscriptions-protocol/ethscriptions-indexer">
                Indexer source on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
