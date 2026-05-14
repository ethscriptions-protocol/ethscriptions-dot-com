// MetaTags.js
import Head from 'next/head';
import { endpoints } from '~~/lib/endpoints';

const MetaTags = ({ collection }) => {
  const title = collection?.name ? `${collection?.name} | Ethscriptions` : "Ethscriptions"

  const image = `${endpoints.website}/ethscriptions-og-v2.png`
  
  return <>
    <Head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      
      <title>{title}</title>
      <meta name="description" content={collection?.description} />
      <meta name="image" content={image} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:image" content={image} />
      <meta property="og:description" content={collection?.description} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Ethscriptions" />

      {/* Twitter */}
      <meta name="twitter:image" content={image} />
      <meta name="twitter:card" content="summary_large_image" />

      {/* Favicon */}
      <link
        rel="icon"
        href={image}
      />
    </Head>
  </>
};

export default MetaTags;