import type { OrderingSetup } from "./ordering";
import type { ThemeChoice } from "./theme";
import type {
  Allergen,
  Category,
  Customer,
  MenuItem,
  Order,
  OrderLine,
  Shop,
  Staff,
  Station,
  TicketComponent,
} from "./types";

export const DEMO_EMAIL = "mei@goldendragon.example";
export const DEMO_PASSWORD = "dragon";
export const DEMO_PIN = "2580";
export const API_VERSION = "0.1.0";
export const STAMP_GOAL = 10;

export const shop: Shop = {
  id: "golden-dragon",
  name: "Golden Dragon",
  nameZh: "金龍",
  address: "48 High Street, Watford WD17 2BS",
  city: "Watford",
  phone: "01923 220418",
};

export const staff: Staff = {
  id: "mei",
  name: "Mei",
  role: "owner",
};

export const categories: Category[] = [
  { id: "appetisers", nameEn: "Appetisers", nameZh: "小食", sort: 10 },
  { id: "soup", nameEn: "Soup", nameZh: "湯", sort: 20 },
  { id: "chicken", nameEn: "Chicken", nameZh: "雞", sort: 30 },
  { id: "beef", nameEn: "Beef", nameZh: "牛", sort: 40 },
  { id: "roast", nameEn: "Roast & pork", nameZh: "燒味", sort: 50 },
  { id: "seafood", nameEn: "Seafood", nameZh: "海鮮", sort: 60 },
  { id: "noodles", nameEn: "Noodles", nameZh: "麵", sort: 70 },
  { id: "rice", nameEn: "Rice", nameZh: "飯", sort: 80 },
  { id: "sets", nameEn: "Set meals", nameZh: "套餐", sort: 90 },
  { id: "sides", nameEn: "Sides", nameZh: "配菜", sort: 100 },
  { id: "drinks", nameEn: "Drinks", nameZh: "飲品", sort: 110 },
];

type SeedItem = {
  number: number;
  categoryId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string;
  pricePence: number;
  station: Station;
  allergens?: Allergen[];
  soldOut?: boolean;
  kind?: "item" | "set";
  includes?: { number: number; qty: number }[];
};

const soy: Allergen[] = ["gluten", "soya"];

const items: SeedItem[] = [
  {
    number: 1,
    categoryId: "appetisers",
    nameEn: "Crispy aromatic duck (quarter)",
    nameZh: "香酥鴨（四分一）",
    descriptionEn: "With pancakes, cucumber, spring onion and hoisin.",
    pricePence: 1180,
    station: "fryer",
    allergens: ["gluten", "soya", "sesame"],
  },
  {
    number: 2,
    categoryId: "appetisers",
    nameEn: "Mini vegetable spring rolls",
    nameZh: "迷你菜春卷",
    pricePence: 420,
    station: "fryer",
    allergens: soy,
  },
  {
    number: 3,
    categoryId: "appetisers",
    nameEn: "Prawn toast",
    nameZh: "蝦多士",
    pricePence: 560,
    station: "fryer",
    allergens: ["crustaceans", "gluten", "sesame", "eggs", "soya"],
  },
  {
    number: 4,
    categoryId: "appetisers",
    nameEn: "Salt & pepper spare ribs",
    nameZh: "椒鹽排骨",
    pricePence: 780,
    station: "fryer",
    allergens: soy,
  },
  {
    number: 5,
    categoryId: "appetisers",
    nameEn: "Crispy seaweed",
    nameZh: "脆紫菜",
    pricePence: 540,
    station: "fryer",
    allergens: ["soya"],
  },
  {
    number: 6,
    categoryId: "appetisers",
    nameEn: "Smoked shredded chicken",
    nameZh: "熏雞絲",
    pricePence: 690,
    station: "fryer",
    allergens: ["gluten", "soya", "sesame"],
  },
  {
    number: 7,
    categoryId: "appetisers",
    nameEn: "Honey chicken wings",
    nameZh: "蜜糖雞翼",
    pricePence: 680,
    station: "fryer",
    allergens: soy,
  },
  {
    number: 8,
    categoryId: "appetisers",
    nameEn: "Satay chicken skewers",
    nameZh: "沙爹雞串",
    pricePence: 670,
    station: "fryer",
    allergens: ["gluten", "soya", "peanuts", "sesame"],
  },
  {
    number: 11,
    categoryId: "soup",
    nameEn: "Chicken & sweetcorn soup",
    nameZh: "雞粟米湯",
    pricePence: 380,
    station: "wok",
    allergens: ["celery", "soya"],
  },
  {
    number: 12,
    categoryId: "soup",
    nameEn: "Hot & sour soup",
    nameZh: "酸辣湯",
    pricePence: 390,
    station: "wok",
    allergens: ["gluten", "soya", "eggs"],
  },
  {
    number: 13,
    categoryId: "soup",
    nameEn: "Won ton soup",
    nameZh: "雲吞湯",
    pricePence: 460,
    station: "wok",
    allergens: soy,
  },
  {
    number: 20,
    categoryId: "chicken",
    nameEn: "Chicken with green pepper in black bean sauce",
    nameZh: "豉椒雞",
    pricePence: 710,
    station: "wok",
    allergens: soy,
  },
  {
    number: 21,
    categoryId: "chicken",
    nameEn: "Chicken with mushrooms",
    nameZh: "蘑菇雞",
    pricePence: 710,
    station: "wok",
    allergens: soy,
  },
  {
    number: 22,
    categoryId: "chicken",
    nameEn: "Chicken with cashew nuts",
    nameZh: "腰果雞",
    pricePence: 760,
    station: "wok",
    allergens: ["gluten", "soya", "nuts"],
  },
  {
    number: 23,
    categoryId: "chicken",
    nameEn: "Kung po chicken",
    nameZh: "宮保雞",
    pricePence: 720,
    station: "wok",
    allergens: ["gluten", "soya", "peanuts"],
    soldOut: true,
  },
  {
    number: 24,
    categoryId: "chicken",
    nameEn: "Lemon chicken",
    nameZh: "檸檬雞",
    pricePence: 730,
    station: "fryer",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 25,
    categoryId: "chicken",
    nameEn: "Sweet & sour chicken Hong Kong style",
    nameZh: "港式咕嚕雞",
    pricePence: 720,
    station: "fryer",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 26,
    categoryId: "chicken",
    nameEn: "Chicken in satay sauce",
    nameZh: "沙爹雞",
    pricePence: 730,
    station: "wok",
    allergens: ["gluten", "soya", "peanuts", "sesame"],
  },
  {
    number: 27,
    categoryId: "chicken",
    nameEn: "Chicken curry",
    nameZh: "咖喱雞",
    pricePence: 730,
    station: "wok",
    allergens: ["celery", "mustard", "gluten", "soya"],
  },
  {
    number: 28,
    categoryId: "chicken",
    nameEn: "Chicken with ginger & spring onion",
    nameZh: "薑蔥雞",
    pricePence: 720,
    station: "wok",
    allergens: soy,
  },
  {
    number: 40,
    categoryId: "beef",
    nameEn: "Beef with green pepper in black bean sauce",
    nameZh: "豉椒牛",
    pricePence: 780,
    station: "wok",
    allergens: soy,
  },
  {
    number: 41,
    categoryId: "beef",
    nameEn: "Beef with mushrooms",
    nameZh: "蘑菇牛",
    pricePence: 780,
    station: "wok",
    allergens: soy,
  },
  {
    number: 42,
    categoryId: "beef",
    nameEn: "Crispy chilli beef",
    nameZh: "乾炒脆牛",
    pricePence: 810,
    station: "fryer",
    allergens: soy,
  },
  {
    number: 43,
    categoryId: "beef",
    nameEn: "Beef in oyster sauce",
    nameZh: "蠔油牛",
    pricePence: 790,
    station: "wok",
    allergens: ["gluten", "soya", "molluscs"],
  },
  {
    number: 44,
    categoryId: "beef",
    nameEn: "Beef curry",
    nameZh: "咖喱牛",
    pricePence: 790,
    station: "wok",
    allergens: ["celery", "mustard", "gluten", "soya"],
  },
  {
    number: 45,
    categoryId: "beef",
    nameEn: "Beef with ginger & spring onion",
    nameZh: "薑蔥牛",
    pricePence: 790,
    station: "wok",
    allergens: soy,
  },
  {
    number: 50,
    categoryId: "roast",
    nameEn: "Char siu",
    nameZh: "叉燒",
    pricePence: 770,
    station: "rice",
    allergens: soy,
  },
  {
    number: 51,
    categoryId: "roast",
    nameEn: "Roast pork",
    nameZh: "燒肉",
    pricePence: 790,
    station: "rice",
    allergens: ["soya"],
  },
  {
    number: 52,
    categoryId: "roast",
    nameEn: "Sweet & sour pork Hong Kong style",
    nameZh: "港式咕嚕肉",
    pricePence: 730,
    station: "fryer",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 53,
    categoryId: "roast",
    nameEn: "Roast duck",
    nameZh: "燒鴨",
    pricePence: 880,
    station: "rice",
    allergens: ["soya"],
  },
  {
    number: 54,
    categoryId: "roast",
    nameEn: "Duck with plum sauce",
    nameZh: "梅子鴨",
    pricePence: 820,
    station: "wok",
    allergens: soy,
  },
  {
    number: 60,
    categoryId: "seafood",
    nameEn: "King prawn with green pepper in black bean sauce",
    nameZh: "豉椒大蝦",
    pricePence: 860,
    station: "wok",
    allergens: ["crustaceans", "gluten", "soya"],
  },
  {
    number: 61,
    categoryId: "seafood",
    nameEn: "Sweet & sour king prawn",
    nameZh: "咕嚕大蝦",
    pricePence: 860,
    station: "fryer",
    allergens: ["crustaceans", "gluten", "eggs", "soya"],
  },
  {
    number: 62,
    categoryId: "seafood",
    nameEn: "King prawn with mushrooms",
    nameZh: "蘑菇大蝦",
    pricePence: 860,
    station: "wok",
    allergens: ["crustaceans", "gluten", "soya"],
  },
  {
    number: 63,
    categoryId: "seafood",
    nameEn: "King prawn with ginger & spring onion",
    nameZh: "薑蔥大蝦",
    pricePence: 870,
    station: "wok",
    allergens: ["crustaceans", "gluten", "soya"],
  },
  {
    number: 64,
    categoryId: "seafood",
    nameEn: "Squid in black bean sauce",
    nameZh: "豉椒鮮魷",
    pricePence: 820,
    station: "wok",
    allergens: ["molluscs", "gluten", "soya"],
  },
  {
    number: 70,
    categoryId: "noodles",
    nameEn: "Special chow mein",
    nameZh: "特別炒麵",
    pricePence: 820,
    station: "wok",
    allergens: ["gluten", "eggs", "soya", "crustaceans"],
  },
  {
    number: 71,
    categoryId: "noodles",
    nameEn: "Chicken chow mein",
    nameZh: "雞炒麵",
    pricePence: 740,
    station: "wok",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 72,
    categoryId: "noodles",
    nameEn: "Beef chow mein",
    nameZh: "牛炒麵",
    pricePence: 790,
    station: "wok",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 73,
    categoryId: "noodles",
    nameEn: "King prawn chow mein",
    nameZh: "大蝦炒麵",
    pricePence: 870,
    station: "wok",
    allergens: ["gluten", "eggs", "soya", "crustaceans"],
  },
  {
    number: 74,
    categoryId: "noodles",
    nameEn: "Singapore rice noodles",
    nameZh: "星洲炒米",
    pricePence: 780,
    station: "wok",
    allergens: ["gluten", "eggs", "soya", "crustaceans", "mustard"],
  },
  {
    number: 75,
    categoryId: "noodles",
    nameEn: "Plain chow mein",
    nameZh: "淨炒麵",
    pricePence: 540,
    station: "wok",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 76,
    categoryId: "noodles",
    nameEn: "Mushroom chow mein",
    nameZh: "蘑菇炒麵",
    pricePence: 690,
    station: "wok",
    allergens: ["gluten", "eggs", "soya"],
  },
  {
    number: 80,
    categoryId: "rice",
    nameEn: "Boiled rice",
    nameZh: "白飯",
    pricePence: 310,
    station: "rice",
  },
  {
    number: 81,
    categoryId: "rice",
    nameEn: "Egg fried rice",
    nameZh: "蛋炒飯",
    pricePence: 390,
    station: "wok",
    allergens: ["eggs", "soya", "gluten"],
  },
  {
    number: 82,
    categoryId: "rice",
    nameEn: "Special fried rice",
    nameZh: "特別炒飯",
    pricePence: 790,
    station: "wok",
    allergens: ["eggs", "soya", "gluten", "crustaceans"],
  },
  {
    number: 83,
    categoryId: "rice",
    nameEn: "Chicken fried rice",
    nameZh: "雞炒飯",
    pricePence: 720,
    station: "wok",
    allergens: ["eggs", "soya", "gluten"],
  },
  {
    number: 84,
    categoryId: "rice",
    nameEn: "King prawn fried rice",
    nameZh: "大蝦炒飯",
    pricePence: 850,
    station: "wok",
    allergens: ["eggs", "soya", "gluten", "crustaceans"],
  },
  {
    number: 85,
    categoryId: "rice",
    nameEn: "Char siu fried rice",
    nameZh: "叉燒炒飯",
    pricePence: 740,
    station: "wok",
    allergens: ["eggs", "soya", "gluten"],
  },
  {
    number: 86,
    categoryId: "rice",
    nameEn: "Mushroom fried rice",
    nameZh: "蘑菇炒飯",
    pricePence: 680,
    station: "wok",
    allergens: ["eggs", "soya", "gluten"],
  },
  {
    number: 201,
    categoryId: "sets",
    nameEn: "Set meal A for one",
    nameZh: "一人套餐 A",
    descriptionEn: "Sweet & sour chicken, egg fried rice, spring roll, prawn crackers.",
    pricePence: 1240,
    station: "counter",
    kind: "set",
    allergens: ["gluten", "eggs", "soya", "crustaceans"],
    includes: [
      { number: 25, qty: 1 },
      { number: 81, qty: 1 },
      { number: 2, qty: 1 },
      { number: 90, qty: 1 },
    ],
  },
  {
    number: 202,
    categoryId: "sets",
    nameEn: "Set meal B for one",
    nameZh: "一人套餐 B",
    descriptionEn: "Beef in black bean sauce, egg fried rice, prawn toast.",
    pricePence: 1290,
    station: "counter",
    kind: "set",
    allergens: ["gluten", "eggs", "soya", "crustaceans", "sesame"],
    includes: [
      { number: 40, qty: 1 },
      { number: 81, qty: 1 },
      { number: 3, qty: 1 },
    ],
  },
  {
    number: 203,
    categoryId: "sets",
    nameEn: "Set meal for two",
    nameZh: "兩人套餐",
    descriptionEn: "Aromatic duck, sweet & sour chicken, beef in black bean, special fried rice, boiled rice, spring rolls.",
    pricePence: 2450,
    station: "counter",
    kind: "set",
    allergens: ["gluten", "eggs", "soya", "sesame", "crustaceans"],
    includes: [
      { number: 1, qty: 1 },
      { number: 25, qty: 1 },
      { number: 40, qty: 1 },
      { number: 82, qty: 1 },
      { number: 80, qty: 1 },
      { number: 2, qty: 1 },
    ],
  },
  {
    number: 90,
    categoryId: "sides",
    nameEn: "Prawn crackers",
    nameZh: "蝦片",
    pricePence: 280,
    station: "fryer",
    allergens: ["crustaceans"],
  },
  {
    number: 91,
    categoryId: "sides",
    nameEn: "Chips",
    nameZh: "薯條",
    pricePence: 310,
    station: "fryer",
  },
  {
    number: 92,
    categoryId: "sides",
    nameEn: "Salt & pepper chips",
    nameZh: "椒鹽薯條",
    pricePence: 420,
    station: "fryer",
    allergens: soy,
  },
  {
    number: 93,
    categoryId: "sides",
    nameEn: "Stir-fried beansprouts",
    nameZh: "清炒芽菜",
    pricePence: 520,
    station: "wok",
    allergens: ["soya"],
  },
  {
    number: 94,
    categoryId: "sides",
    nameEn: "Curry sauce",
    nameZh: "咖喱汁",
    pricePence: 210,
    station: "wok",
    allergens: ["celery", "mustard"],
  },
  {
    number: 95,
    categoryId: "sides",
    nameEn: "Sweet & sour sauce",
    nameZh: "甜酸汁",
    pricePence: 180,
    station: "counter",
    allergens: ["soya"],
  },
  {
    number: 96,
    categoryId: "sides",
    nameEn: "Pancakes (6)",
    nameZh: "薄餅",
    pricePence: 240,
    station: "counter",
    allergens: ["gluten"],
  },
  {
    number: 100,
    categoryId: "drinks",
    nameEn: "Coke",
    nameZh: "可樂",
    pricePence: 150,
    station: "counter",
  },
  {
    number: 101,
    categoryId: "drinks",
    nameEn: "Diet Coke",
    nameZh: "健怡可樂",
    pricePence: 150,
    station: "counter",
  },
  {
    number: 102,
    categoryId: "drinks",
    nameEn: "7UP",
    nameZh: "七喜",
    pricePence: 150,
    station: "counter",
  },
  {
    number: 103,
    categoryId: "drinks",
    nameEn: "Chinese tea",
    nameZh: "中國茶",
    pricePence: 120,
    station: "counter",
  },
  {
    number: 104,
    categoryId: "drinks",
    nameEn: "Tsingtao",
    nameZh: "青島啤酒",
    pricePence: 420,
    station: "counter",
    allergens: ["gluten"],
  },
];

export type DemoState = {
  version: 1;
  shop: Shop;
  staff: Staff;
  categories: Category[];
  items: MenuItem[];
  orders: Order[];
  customers: Customer[];
  nextOrderNumber: number;
  /** The demo shop's theme. The demo keeps it in this browser. */
  theme?: ThemeChoice;
  /** How the demo shop takes orders and payment. Kept in this browser; v0.1's defaults when missing. */
  ordering?: OrderingSetup;
};

function buildItems(): MenuItem[] {
  return items.map((item) => ({
    id: `item-${item.number}`,
    number: item.number,
    categoryId: item.categoryId,
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    descriptionEn: item.descriptionEn ?? "",
    pricePence: item.pricePence,
    station: item.station,
    allergens: item.allergens ?? [],
    soldOut: item.soldOut ?? false,
    kind: item.kind ?? "item",
    includes: item.includes ?? [],
  }));
}

type Draft = {
  number: number;
  hoursAgo: number;
  status: Order["status"];
  source: Order["source"];
  fulfilment: Order["fulfilment"];
  customerName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  lines: { number: number; qty: number }[];
};

function hoursAgoButSameStory(now: Date, hoursAgo: number): string {
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function lineFrom(menu: MenuItem[], number: number, qty: number): OrderLine {
  const item = menu.find((entry) => entry.number === number);
  if (!item) throw new Error(`Seed refers to missing dish ${number}`);
  const components: TicketComponent[] = item.includes.map((include) => {
    const part = menu.find((entry) => entry.number === include.number);
    if (!part) throw new Error(`Set ${item.number} is missing dish ${include.number}`);
    return {
      number: part.number,
      nameEn: part.nameEn,
      nameZh: part.nameZh,
      qty: include.qty * qty,
      station: part.station,
    };
  });
  return {
    itemId: item.id,
    number: item.number,
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    qty,
    unitPricePence: item.pricePence,
    station: item.station,
    kind: item.kind,
    components,
  };
}

function buildOrders(menu: MenuItem[], now: Date): Order[] {
  const drafts: Draft[] = [
    {
      number: 1830,
      hoursAgo: 240,
      status: "completed",
      source: "phone",
      fulfilment: "collection",
      customerName: "Mrs Wong",
      phone: "07700 900441",
      lines: [
        { number: 20, qty: 1 },
        { number: 81, qty: 1 },
      ],
    },
    {
      number: 1836,
      hoursAgo: 72,
      status: "completed",
      source: "counter",
      fulfilment: "collection",
      lines: [{ number: 74, qty: 1 }],
    },
    {
      number: 1840,
      hoursAgo: 48,
      status: "completed",
      source: "phone",
      fulfilment: "collection",
      customerName: "Mrs Wong",
      phone: "07700 900441",
      lines: [
        { number: 50, qty: 1 },
        { number: 80, qty: 1 },
        { number: 101, qty: 1 },
      ],
    },
    {
      number: 1842,
      hoursAgo: 26,
      status: "completed",
      source: "online",
      fulfilment: "delivery",
      customerName: "Aisha Khan",
      phone: "07700 900219",
      address: "22 Cassiobury Drive, Watford WD17 3AD",
      lines: [
        { number: 24, qty: 1 },
        { number: 81, qty: 1 },
      ],
    },
    {
      number: 1848,
      hoursAgo: 3,
      status: "completed",
      source: "phone",
      fulfilment: "collection",
      customerName: "Mrs Wong",
      phone: "07700 900441",
      lines: [
        { number: 71, qty: 1 },
        { number: 80, qty: 2 },
      ],
    },
    {
      number: 1850,
      hoursAgo: 2,
      status: "completed",
      source: "phone",
      fulfilment: "delivery",
      customerName: "James Okafor",
      phone: "07700 900882",
      address: "14 Whippendell Road, Watford WD18 7LU",
      notes: "Gate code 214.",
      lines: [
        { number: 60, qty: 1 },
        { number: 44, qty: 1 },
        { number: 82, qty: 1 },
        { number: 90, qty: 1 },
      ],
    },
    {
      number: 1851,
      hoursAgo: 1.2,
      status: "completed",
      source: "counter",
      fulfilment: "collection",
      lines: [
        { number: 27, qty: 1 },
        { number: 80, qty: 1 },
        { number: 91, qty: 1 },
      ],
    },
    {
      number: 1852,
      hoursAgo: 0.65,
      status: "ready",
      source: "phone",
      fulfilment: "collection",
      customerName: "Aisha Khan",
      phone: "07700 900219",
      notes: "Extra hoisin with the duck.",
      lines: [
        { number: 1, qty: 1 },
        { number: 103, qty: 1 },
      ],
    },
    {
      number: 1854,
      hoursAgo: 0.28,
      status: "preparing",
      source: "phone",
      fulfilment: "delivery",
      customerName: "The Office",
      phone: "01923 555014",
      address: "8 Market Street, Watford WD18 0PD",
      notes: "Call on arrival. No MSG if you can help it.",
      lines: [
        { number: 201, qty: 1 },
        { number: 202, qty: 1 },
      ],
    },
    {
      number: 1856,
      hoursAgo: 0.07,
      status: "new",
      source: "online",
      fulfilment: "collection",
      customerName: "Tom Bradley",
      phone: "07700 900773",
      lines: [
        { number: 42, qty: 1 },
        { number: 81, qty: 1 },
        { number: 2, qty: 1 },
      ],
    },
  ];

  return drafts
    .map((draft) => {
      const lines = draft.lines.map((entry) => lineFrom(menu, entry.number, entry.qty));
      const order: Order = {
        id: `ord-${draft.number}`,
        number: draft.number,
        createdAt: hoursAgoButSameStory(now, draft.hoursAgo),
        source: draft.source,
        fulfilment: draft.fulfilment,
        status: draft.status,
        customerName: draft.customerName ?? "",
        phone: draft.phone ?? "",
        address: draft.address ?? "",
        notes: draft.notes ?? "",
        lines,
        totalPence: lines.reduce((sum, entry) => sum + entry.qty * entry.unitPricePence, 0),
        payment:
          draft.source === "online"
            ? draft.number % 2 === 0
              ? { method: "card", status: "paid" }
              : { method: "at_shop", status: "due" }
            : null,
      };
      return order;
    })
    .sort((a, b) => b.number - a.number);
}

function buildCustomers(now: Date): Customer[] {
  const at = (hoursAgo: number) => hoursAgoButSameStory(now, hoursAgo);
  return [
    {
      id: "07700900441",
      phone: "07700 900441",
      name: "Mrs Wong",
      stamps: 7,
      rewardsRedeemed: 2,
      createdAt: at(2400),
    },
    {
      id: "07700900882",
      phone: "07700 900882",
      name: "James Okafor",
      stamps: 3,
      rewardsRedeemed: 0,
      createdAt: at(800),
    },
    {
      id: "01923555014",
      phone: "01923 555014",
      name: "The Office",
      stamps: 10,
      rewardsRedeemed: 1,
      createdAt: at(1500),
    },
    {
      id: "07700900219",
      phone: "07700 900219",
      name: "Aisha Khan",
      stamps: 1,
      rewardsRedeemed: 0,
      createdAt: at(400),
    },
    {
      id: "07700900773",
      phone: "07700 900773",
      name: "Tom Bradley",
      stamps: 4,
      rewardsRedeemed: 0,
      createdAt: at(200),
    },
  ];
}

export function createSeedState(now: Date): DemoState {
  const menu = buildItems();
  const seen = new Set<number>();
  for (const item of menu) {
    if (seen.has(item.number)) throw new Error(`Duplicate dish number ${item.number}`);
    seen.add(item.number);
  }
  for (const item of menu) {
    for (const include of item.includes) {
      if (!seen.has(include.number)) {
        throw new Error(`Set ${item.number} is missing dish ${include.number}`);
      }
    }
  }

  return {
    version: 1,
    shop,
    staff,
    categories,
    items: menu,
    orders: buildOrders(menu, now),
    customers: buildCustomers(now),
    nextOrderNumber: 1857,
  };
}
