import type { CopyKey } from "./i18n";
import type { Station } from "./types";

export const STATION_LABEL: Record<Station, CopyKey> = {
  wok: "stationWok",
  fryer: "stationFryer",
  rice: "stationRice",
  counter: "stationCounter",
};

export const STATION_GLOSS: Record<Station, CopyKey> = {
  wok: "stationWokZh",
  fryer: "stationFryerZh",
  rice: "stationRiceZh",
  counter: "stationCounterZh",
};
