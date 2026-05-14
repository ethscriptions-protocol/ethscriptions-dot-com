import type { NextPage } from "next";
import ReactMarkdown from "react-markdown";
import { Heading } from "~~/components/Heading";
import MetaTags from "~~/components/MetaTags";
import { Section } from "~~/components/Section";
import { SectionContainer } from "~~/components/SectionContainer";

const markdown = `

## Quick Start: Creating an Ethscription in 60 Seconds

This site has an [easy creation tool](/create), but if you want to go step-by-step:

1) Convert an image (max size: ~90KB) to a Base 64-encoded data URI (\`data:image/png;base64,...\`) using a service like [base64-image.de](https://www.base64-image.de/). The Ethscriptions protocol supports all data URIs but images work best.

2) Convert the data URI to hex using an online tool like [hexhero](https://www.hexhero.com/converters/utf8-to-hex).

3) Send a 0 eth transaction *to the person you want to own the Ethscription* with the hex data from (2) in the "Hex data" field

4) After a few moments it should appear on this site, *provided someone hasn’t already Ethscribed the same data*. Duplicate content is ignored!
  
## How to Transfer Ethscriptions

1) Find the id of the Ethscription you want to transfer. An Ethscription’s id is the transaction hash of the transaction that created the Ethscription. It looks like this: \`0xcdb372580242c1c1bbcd2914ddbdb609b33d2e2e163c6595e164cb4dc6665153\`. You can get this from Etherscan or from this site.

2) Send a 0 ETH transaction to the new proposed owner, including the Ethscription ID in the "Hex data" field.

3) After a few moments the Ethscription’s owner should update on this site, *provided you were the owner of the Ethscription when you sent the transfer transaction*. Unauthorized transfers are ignored.

## How to Track Ethscriptions

You can use this website! However if you don’t want to rely on me you can track things yourself as all the necessary data is publicly available and uncensorable.

You will need an indexer; the one that powers this website is open source. Or build your own — it’s not that hard. You can get historical data from BigQuery and use Alchemy APIs for real-time data.

## How does it work specifically?

- Any successful Ethereum transaction whose input data (when interpreted as UTF-8) is a valid data URI creates an Ethscription, provided the data URI is unique. All valid mimetypes are supported.

- For the URI to be unique, no Ethscription from a previous block or a transaction earlier in the block can have the same content.

- Any Ethereum transaction whose input data is the transaction hash of a valid Ethscription is a valid Ethscription transfer, provided the transaction sender is the Ethscription’s owner.

- The recipient of the creation transaction is the Ethscription’s initial owner. The sender of the creation transaction is the Ethscription's creator.

## FAQ

**Are Ethscriptions secure and trustless?**

Absolutely! You can use the Ethscriptions protocol without relying on external parties. While it might be convenient to trust an indexer, like most Ethereum community members do with Etherscan, you can always rebuild and verify the indexer data manually.

**Are Ethscriptions decentralized?**

Yes, Ethscriptions reinterpret existing Ethereum data, which is decentralized by nature. No one's permission is required to use Ethscriptions and no one can ban you from using it. By contrast, NFTs often rely on data stored in specific contracts that one person might control.

## Who Made This?

The earliest Ethscription was created in 2016, but the formal protocol, this website, and the indexer that powers it was developed by Middlemarch aka Tom Lehman aka [@dumbnamenumbers on Twitter](https://twitter.com/dumbnamenumbers). Obviously it draws heavy inspiration from Bitcoin Inscriptions, but it is equally inspired by the famous proto-Ethscription [in this transaction](https://etherscan.io/tx/0x0ae3d3ce3630b5162484db5f3bdfacdfba33724ffb195ea92a6056beaa169490). The author writes:

> ETHEREUM HAS THE POTENTIAL TO BE A SECURED AND ANONYMOUS COMMUNICATION CHANNEL, BUT ITS NOT FRIENDLY TO AVERAGE USERS. THE EXTRACTION OF MESSAGE REQUIRES SOME THEQUINIES, THE ENCRYPTION OF MESSAGE IS A MORE ADVANCED SKILL. I HAVE NO RESEARCH ON EXISTING PROJECTS. AND THE GAS FEE STOPS MOST USERS, THOUGH IT DOES NOT STOP REFUGEES. IS IT POSSIBLE TO ULTILIZE THE ETH NETWORK FOR FREE BY USING EXTREMELY LOW GAS? A SNAPCHAT ON CHAIN?`;

const About: NextPage = () => {
  const EthscriptionInfo = {
    name: "Ethscriptions Protocol",
    description:
      "Ethscriptions are a new way of creating and sharing digital artifacts on Ethereum that is cheaper and more decentralized than NFTs!",
  };

  return (
    <>
      <MetaTags collection={EthscriptionInfo} />

      <SectionContainer>
        <Section className="gap-8">
          <Heading size="h1" className="mx-auto">
            Introducing Ethscriptions
          </Heading>

          <div className="flex flex-col gap-12 flex-1 pb-12 w-full">
            <div className="px-4 sm:px-6 lg:px-8 max-w-prose mx-auto w-full">
              <div className="text-lg">
                <p className="mt-8 text-xl leading-8 opacity-75">
                  Ethscriptions are a new way of creating and sharing digital artifacts on Ethereum using transaction
                  calldata.
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-4">
                <ReactMarkdown className="markdown flex flex-col gap-4" children={markdown}></ReactMarkdown>
              </div>
            </div>
          </div>
        </Section>
      </SectionContainer>
    </>
  );
};

export default About;
