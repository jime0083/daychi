import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // プロジェクトルートの CLAUDE.md はプロジェクト規約(唯一の正)のため、
  // next dev による AGENTS.md/CLAUDE.md への自動書き込みを無効化する
  agentRules: false,
};

export default nextConfig;
