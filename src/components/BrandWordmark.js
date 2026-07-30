import React from "react";

const BrandWordmark = ({ className = "" }) => {
  return (
    <span className={className}>
      Vakilpedia
      <sup
        data-vtm="vakilpedia-trademark"
        className="ml-0.45 align-super text-[0.38em] font-medium tracking-tight leading-none pointer-events-none select-none"
      >
        TM
      </sup>
    </span>
  );
};

export default BrandWordmark;
