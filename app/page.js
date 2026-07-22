"use client";
import dynamic from "next/dynamic";
const ZetaDesk = dynamic(() => import("@/components/ZetaDesk"), { ssr: false });
export default function Page() { return <ZetaDesk />; }
