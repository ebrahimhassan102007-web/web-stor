/**
 * Initial catalog data (categories + products).
 *
 * Shared by:
 *  - the automatic first-boot seed in `src/lib/db/index.ts`, and
 *  - the manual `npm run db:seed` script (force re-seed).
 */

export const SEED_CATEGORIES = [
  { slug: "electronics", name: "Electronics", icon: "💻", description: "Laptops, monitors, audio and cutting-edge devices." },
  { slug: "security", name: "Security Gear", icon: "🛡️", description: "Hardware keys, encrypted drives and privacy tools." },
  { slug: "fashion", name: "Fashion", icon: "🧥", description: "Techwear, apparel and everyday carry style." },
  { slug: "gaming", name: "Gaming", icon: "🎮", description: "Peripherals, consoles and battle-ready rigs." },
  { slug: "home", name: "Smart Home", icon: "🏠", description: "Automation, lighting and connected living." },
  { slug: "accessories", name: "Accessories", icon: "🎒", description: "Bags, docks, cables and daily essentials." },
] as const;

export type SeedProduct = {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  category: (typeof SEED_CATEGORIES)[number]["slug"];
  stock: number;
  rating: string;
  reviewCount: number;
  icon: string;
  featured?: boolean;
};

export const SEED_PRODUCTS: SeedProduct[] = [
  // Electronics
  { slug: "quantum-x1-laptop", name: "Quantum X1 Ultrabook", description: "A 14-inch powerhouse with a 3K OLED display, 32 GB RAM and a hardware-level secure enclave. Built for engineers who ship from anywhere: 18-hour battery, tamper-evident chassis and a fingerprint reader integrated into the power key.", priceCents: 189900, category: "electronics", stock: 12, rating: "4.8", reviewCount: 412, icon: "💻", featured: true },
  { slug: "nebula-4k-monitor", name: "Nebula 32\" 4K Monitor", description: "Factory-calibrated 4K IPS panel with 98% DCI-P3 coverage, USB-C 90 W passthrough and a blue-light shield mode for long night sessions.", priceCents: 64900, category: "electronics", stock: 27, rating: "4.6", reviewCount: 289, icon: "🖥️" },
  { slug: "pulse-anc-headphones", name: "Pulse ANC Headphones", description: "Adaptive noise cancellation tuned for open offices, 40-hour battery, and a boom-quality mic array for crystal-clear calls.", priceCents: 27900, category: "electronics", stock: 54, rating: "4.7", reviewCount: 1874, icon: "🎧", featured: true },
  { slug: "aero-drone-pro", name: "Aero Drone Pro", description: "4K/60 fps stabilized camera drone with 34-minute flight time, obstacle avoidance and encrypted video downlink.", priceCents: 99900, category: "electronics", stock: 8, rating: "4.5", reviewCount: 156, icon: "🛸" },
  { slug: "volt-gan-charger", name: "Volt 140W GaN Charger", description: "Three-port GaN fast charger that powers a laptop, phone and earbuds simultaneously — half the size of a standard brick.", priceCents: 7900, category: "electronics", stock: 132, rating: "4.9", reviewCount: 3210, icon: "🔌" },

  // Security Gear
  { slug: "sentinel-hardware-key", name: "Sentinel FIDO2 Hardware Key", description: "Phishing-proof passwordless login with FIDO2/WebAuthn, NFC + USB-C, and a secure element rated EAL6+. The last second factor you will ever need.", priceCents: 5900, category: "security", stock: 210, rating: "4.9", reviewCount: 5120, icon: "🔑", featured: true },
  { slug: "vault-encrypted-ssd", name: "Vault X 2TB Encrypted SSD", description: "XTS-AES 256 hardware encryption with keypad unlock, brute-force self-wipe and IP68 ruggedized housing. Your data, sealed.", priceCents: 32900, category: "security", stock: 45, rating: "4.8", reviewCount: 640, icon: "🗄️", featured: true },
  { slug: "ghost-privacy-screen", name: "Ghost Privacy Screen 14\"", description: "Magnetic micro-louver filter that blacks out your display beyond 30° — shoulder surfers see nothing.", priceCents: 4900, category: "security", stock: 88, rating: "4.4", reviewCount: 421, icon: "🕶️" },
  { slug: "cipher-rfid-wallet", name: "Cipher RFID-Blocking Wallet", description: "Aerospace aluminum card vault with RFID/NFC shielding and a quick-fan trigger. Slim enough to forget, tough enough not to.", priceCents: 6900, category: "security", stock: 150, rating: "4.6", reviewCount: 980, icon: "🛡️" },
  { slug: "watchdog-cam", name: "Watchdog Secure Cam", description: "End-to-end encrypted home camera with local-only storage option, physical lens shutter and zero-cloud mode.", priceCents: 14900, category: "security", stock: 33, rating: "4.5", reviewCount: 267, icon: "📹" },

  // Fashion
  { slug: "shadow-tech-jacket", name: "Shadow Techwear Jacket", description: "Water-repellent softshell with 9 hidden zip pockets, cable routing channels and reflective night-safe piping.", priceCents: 18900, category: "fashion", stock: 41, rating: "4.7", reviewCount: 534, icon: "🧥", featured: true },
  { slug: "cipher-hoodie", name: "Cipher Graphite Hoodie", description: "Heavyweight 420 gsm organic cotton hoodie in deep graphite with a minimal red stitch accent. Warm, structured, quiet.", priceCents: 8900, category: "fashion", stock: 97, rating: "4.8", reviewCount: 1203, icon: "👕" },
  { slug: "stealth-sneakers", name: "Stealth Low Sneakers", description: "All-black knit sneakers with a carbon-fiber shank and grippy all-weather outsole. From server room to street.", priceCents: 12900, category: "fashion", stock: 63, rating: "4.5", reviewCount: 789, icon: "👟" },
  { slug: "night-ops-cap", name: "Night Ops Cap", description: "Matte black 6-panel cap with laser-cut vents and a hidden key pocket under the brim.", priceCents: 3400, category: "fashion", stock: 180, rating: "4.3", reviewCount: 342, icon: "🧢" },

  // Gaming
  { slug: "raptor-mech-keyboard", name: "Raptor Mechanical Keyboard", description: "Hot-swappable 75% board with gasket mount, PBT keycaps and per-key RGB tuned for dark-room setups.", priceCents: 15900, category: "gaming", stock: 58, rating: "4.8", reviewCount: 2109, icon: "⌨️", featured: true },
  { slug: "viper-gaming-mouse", name: "Viper 8K Gaming Mouse", description: "58-gram ultralight with an 8000 Hz polling rate, optical switches and a flawless 30K sensor.", priceCents: 9900, category: "gaming", stock: 74, rating: "4.7", reviewCount: 1645, icon: "🖱️" },
  { slug: "titan-gpu-rig", name: "Titan RTX Battle Rig", description: "Pre-built tower with a flagship GPU, 64 GB DDR5, liquid cooling and a tempered-glass panel bathed in red light.", priceCents: 289900, category: "gaming", stock: 5, rating: "4.9", reviewCount: 98, icon: "🗼" },
  { slug: "haptic-vr-headset", name: "Haptic VR Headset", description: "Dual 2.5K panels, inside-out tracking and haptic audio drivers for full immersion without a base station.", priceCents: 54900, category: "gaming", stock: 0, rating: "4.4", reviewCount: 310, icon: "🥽" },
  { slug: "command-gaming-chair", name: "Command Ergonomic Chair", description: "4D armrests, magnetic lumbar support and breathable graphite mesh rated for 12-hour raids.", priceCents: 42900, category: "gaming", stock: 19, rating: "4.6", reviewCount: 458, icon: "🪑" },

  // Smart Home
  { slug: "aurora-light-panels", name: "Aurora Light Panels (9-pack)", description: "Modular touch-reactive LED panels with 16M colors and local-network control — no cloud account required.", priceCents: 19900, category: "home", stock: 36, rating: "4.6", reviewCount: 720, icon: "💡", featured: true },
  { slug: "nexus-smart-hub", name: "Nexus Smart Hub", description: "Matter + Thread border router that keeps automations local-first. Your home, your data.", priceCents: 12900, category: "home", stock: 48, rating: "4.5", reviewCount: 385, icon: "📡" },
  { slug: "guardian-smart-lock", name: "Guardian Smart Lock", description: "ANSI Grade 1 deadbolt with fingerprint, keypad and offline key codes. Auto-locks behind you.", priceCents: 22900, category: "home", stock: 22, rating: "4.7", reviewCount: 512, icon: "🔒" },
  { slug: "climate-sense-thermostat", name: "ClimateSense Thermostat", description: "Learning thermostat with room-by-room sensors and a crisp OLED ring display. Cuts energy waste by up to 23%.", priceCents: 17900, category: "home", stock: 31, rating: "4.4", reviewCount: 298, icon: "🌡️" },

  // Accessories
  { slug: "vector-commuter-pack", name: "Vector Commuter Backpack", description: "25 L weatherproof pack with a lockable laptop vault, luggage passthrough and theft-resistant zippers.", priceCents: 15900, category: "accessories", stock: 67, rating: "4.8", reviewCount: 934, icon: "🎒", featured: true },
  { slug: "orbit-usb-c-dock", name: "Orbit 11-in-1 USB-C Dock", description: "Dual 4K HDMI, 2.5 GbE, SD reader and 100 W passthrough in a palm-sized anodized shell.", priceCents: 11900, category: "accessories", stock: 84, rating: "4.5", reviewCount: 612, icon: "🧩" },
  { slug: "flux-wireless-pad", name: "Flux 3-in-1 Wireless Pad", description: "Charges phone, watch and earbuds at once with foreign-object detection and cool-touch coils.", priceCents: 8900, category: "accessories", stock: 0, rating: "4.3", reviewCount: 445, icon: "⚡" },
  { slug: "titan-braided-cables", name: "Titan Braided Cable Trio", description: "Three 240 W USB-C cables in Kevlar-reinforced braid — 1 m, 2 m and 3 m — rated for 30,000 bends.", priceCents: 3900, category: "accessories", stock: 240, rating: "4.7", reviewCount: 1520, icon: "🧵" },
];
