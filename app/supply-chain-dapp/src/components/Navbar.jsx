import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="flex justify-between items-center px-6 py-4 bg-gray-900 text-white shadow">
      <h1 className="text-xl font-bold">🔗 Supply Chain DApp</h1>
      <ConnectButton />
    </nav>
  );
}
