// Manufacturer marks for the marque banner.
//
// PROVENANCE: every file in assets/brands/ was fetched from Wikimedia Commons
// and each one is tagged **Public domain** there — these marks are simple
// geometry or lettering, below the threshold of originality for copyright.
// The Commons source file is named beside each entry so any of them can be
// re-fetched or checked.
//
// Copyright is not the whole story though: these are live TRADEMARKS. Showing
// them to label vehicles genuinely of that make is ordinary nominative use and
// is what every car marketplace does. Using them in a way that suggests the
// manufacturer endorses Chez-Nous would not be. That line is a product call,
// not a data-file call — this note exists so whoever owns the product knows
// the distinction was considered rather than missed.
//
// Three marques have no file: Isuzu, Land Rover and Changan had no suitable
// public-domain mark on Commons. They fall back to the monogram plate, which
// is why that fallback stays in the screen rather than being deleted now that
// most makes have art.
//
// Several of these are wordmarks rather than emblems (Hyundai, Kia, Peugeot,
// Mazda, Lexus, Geely, Jeep) because that is what was available. They render
// correctly — `contain` inside the badge — but read smaller than the emblems.
// Replacing one is a drop-in: overwrite the PNG, change nothing here.
import { Image } from "react-native";

export const vehicleBrandLogos = {
  Toyota: require("../../assets/brands/toyota.png"), // File:Toyota EU.svg
  Hyundai: require("../../assets/brands/hyundai.png"), // File:Hyundai Motor Company logo.svg
  Suzuki: require("../../assets/brands/suzuki.png"), // File:Suzuki Motor Corporation logo.svg
  Mercedes: require("../../assets/brands/mercedes.png"), // File:Mercedes-Benz Logo 2010.svg
  Ford: require("../../assets/brands/ford.png"), // File:Ford-Logo-Vector.svg
  Honda: require("../../assets/brands/honda.png"), // File:Honda.svg
  Nissan: require("../../assets/brands/nissan.png"), // File:Nissan logo 2001.svg
  Kia: require("../../assets/brands/kia.png"), // File:KIA logo3.svg
  Peugeot: require("../../assets/brands/peugeot.png"), // File:Peugeot Logo.svg
  Mazda: require("../../assets/brands/mazda.png"), // File:Mazda logo.svg
  Mitsubishi: require("../../assets/brands/mitsubishi.png"), // File:Mitsubishi logo.svg
  Acura: require("../../assets/brands/acura.png"), // File:Acura logo.svg
  Citroën: require("../../assets/brands/citroen.png"), // File:Citroen 2016 logo.svg
  Lexus: require("../../assets/brands/lexus.png"), // File:Lexus logo.svg
  BMW: require("../../assets/brands/bmw.png"), // File:BMW.svg
  Renault: require("../../assets/brands/renault.png"), // File:Renault logo.svg
  Volkswagen: require("../../assets/brands/volkswagen.png"), // File:Volkswagen logo 2019.svg
  Chevrolet: require("../../assets/brands/chevrolet.png"), // File:Chevrolet-logo.svg
  Audi: require("../../assets/brands/audi.png"), // File:Audi logo.svg
  Jeep: require("../../assets/brands/jeep.png"), // File:Jeep logo.svg
  Geely: require("../../assets/brands/geely.png"), // File:Geely logo.svg
};

export function brandLogo(brand) {
  return vehicleBrandLogos[brand] ?? null;
}

export function hasBrandLogo(brand) {
  return !!vehicleBrandLogos[brand];
}

// Some of these marks are wordmarks (around 7:1) and some are emblems (about
// 1:1). Rather than hand-tagging each one — which would drift the moment a
// file is replaced — the ratio is read off the bundled asset itself.
// resolveAssetSource works for local require()d images and needs no network.
export function isWideLogo(brand) {
  const source = vehicleBrandLogos[brand];
  if (!source) return false;
  const resolved = Image.resolveAssetSource(source);
  if (!resolved?.width || !resolved?.height) return false;
  return resolved.width / resolved.height > 2.2;
}
