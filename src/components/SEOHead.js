import React from 'react';

/**
 * SEO Head Component - Handles dynamic meta tags and structured data
 * Safe for production - only adds SEO metadata
 */
const SEOHead = ({ 
  title, 
  description, 
  keywords, 
  canonicalUrl, 
  structuredData,
  imageUrl,
  siteName = 'Vakilpedia',
  twitterCard = 'summary_large_image',
  type = 'website'
}) => {
  React.useEffect(() => {
    const defaultTitle = 'Vakilpedia | Legal Tech Ecosystem';
    const defaultDescription =
      'Vakilpedia provides legal tech tools for Indian lawyers: IPC to BNS converter, EvidenceHash for digital evidence integrity, and more.';
    const canonicalOrigin = 'https://www.vakilpedia.com';

    const normalizeTitle = (input) => {
      const raw = String(input || '').trim();
      if (!raw) return '';

      const defaultPrefix = 'Vakilpedia | Legal Tech Ecosystem |';
      if (raw.startsWith(defaultPrefix)) {
        return raw.slice(defaultPrefix.length).trim();
      }

      if (raw === defaultTitle) return '';

      const suffix = ' | Vakilpedia';
      if (raw.endsWith(suffix)) return raw.slice(0, -suffix.length).trim();

      const legacyPrefix = 'Vakilpedia |';
      if (raw.startsWith(legacyPrefix) && raw !== defaultTitle) {
        const candidate = raw.slice(legacyPrefix.length).trim();
        if (candidate && candidate !== 'Legal Tech Ecosystem') return candidate;
      }

      return raw;
    };

    const pageTitle = normalizeTitle(title);
    const finalTitle = pageTitle ? `${pageTitle} | Vakilpedia` : defaultTitle;
    const finalDescription = String(description || '').trim() || defaultDescription;

    const resolveCanonicalUrl = () => {
      const provided = String(canonicalUrl || '').trim();
      if (provided) return provided;
      if (typeof window === 'undefined') return `${canonicalOrigin}/`;
      const path = window.location && window.location.pathname ? window.location.pathname : '/';
      const normalizedPath = path === '/' ? '/' : path.replace(/\/+$/, '');
      return `${canonicalOrigin}${normalizedPath}`;
    };

    const finalCanonicalUrl = resolveCanonicalUrl();

    document.title = finalTitle;

    // Update or create meta tags
    const updateMetaTag = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    // Update or create meta property
    const updateMetaProperty = (property, content) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    updateMetaTag('description', finalDescription);
    if (keywords) updateMetaTag('keywords', keywords);
    
    document
      .querySelectorAll('meta[property^="twitter:"]')
      .forEach((meta) => meta.parentNode && meta.parentNode.removeChild(meta));

    let resolvedImageUrl = imageUrl;
    if (!resolvedImageUrl && canonicalUrl) {
      try {
        resolvedImageUrl = `${new URL(canonicalUrl).origin}/logo.png`;
      } catch (e) {
        resolvedImageUrl = undefined;
      }
    }

    // Open Graph tags
    updateMetaProperty('og:title', finalTitle);
    updateMetaProperty('og:description', finalDescription);
    updateMetaProperty('og:url', finalCanonicalUrl);
    if (type) updateMetaProperty('og:type', type);
    if (siteName) updateMetaProperty('og:site_name', siteName);
    if (resolvedImageUrl) {
      updateMetaProperty('og:image', resolvedImageUrl);
      updateMetaProperty('og:image:alt', finalTitle);
    }
    
    // Twitter Card tags
    if (twitterCard) updateMetaTag('twitter:card', twitterCard);
    updateMetaTag('twitter:title', finalTitle);
    updateMetaTag('twitter:description', finalDescription);
    updateMetaTag('twitter:url', finalCanonicalUrl);
    if (resolvedImageUrl) updateMetaTag('twitter:image', resolvedImageUrl);

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = finalCanonicalUrl;

    // Add basic structured data
    let publisherUrl = 'https://www.vakilpedia.com';
    if (finalCanonicalUrl) {
      try {
        publisherUrl = new URL(finalCanonicalUrl).origin;
      } catch (e) {
        publisherUrl = 'https://www.vakilpedia.com';
      }
    }

    const basicStructuredData = {
      "@context": "https://schema.org",
      "@type": type === 'article' ? 'Article' : 'WebPage',
      "name": finalTitle,
      "description": finalDescription,
      "url": finalCanonicalUrl,
      "publisher": {
        "@type": "Organization",
        "name": siteName,
        "url": publisherUrl
      }
    };

    // Add structured data (JSON-LD)
    // Some third-party scripts can be strict about "@context" existing,
    // so we defensively coerce/normalize here.
    const normalizeJsonLd = (value) => {
      const withContext = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        if (typeof obj["@context"] === "string" && obj["@context"].trim()) return obj;
        return { ...obj, "@context": "https://schema.org" };
      };

      if (!value) return basicStructuredData;
      if (Array.isArray(value)) {
        return value
          .map((v) => withContext(v))
          .filter((v) => v && typeof v === "object");
      }
      if (typeof value === "object") return withContext(value);
      return basicStructuredData;
    };

    const finalStructuredData = normalizeJsonLd(structuredData) || basicStructuredData;
    let script = document.querySelector('#structured-data');
    if (!script) {
      script = document.createElement('script');
      script.id = 'structured-data';
      script.type = 'application/ld+json';
      // Set contents before appending so mutation observers never see an empty tag.
      script.textContent = JSON.stringify(finalStructuredData);
      document.head.appendChild(script);
    } else {
      script.textContent = JSON.stringify(finalStructuredData);
    }

    // Cleanup on unmount
    return () => {
      // Optional: Reset to defaults if needed
    };
  }, [title, description, keywords, canonicalUrl, structuredData, imageUrl, siteName, twitterCard, type]);

  return null; // This component doesn't render anything
};

export default SEOHead;
