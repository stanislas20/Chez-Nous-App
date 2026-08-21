// Colours follow companySectors.js / jobCategories.js: one mid-luminance
// hex per category, legible both as a solid icon on a pale tint in light
// mode and against a dark surface. They're what makes a long picker
// scannable — you find "Mode & Vêtements" by its pink long before you
// finish reading the labels.
// Each carries a one-line hint of what actually belongs in it. Two of
// these are easy to confuse — "Maison" reads as both "house" and
// "household", which put it next to Immobilier in people's heads and
// overlapping Meubles at the same time. Rather than merge (which would
// strand every listing already filed under the old key), the labels name
// what is inside and the hints settle the boundary: big things you need a
// truck for go in Meubles, everything else for the home goes in Déco.
export const categories = [
  { key: 'pharmacyOnDuty', hintEn: 'Official ONPB duty roster', hintFr: 'Tour de garde officiel ONPB', icon: 'medkit-outline', labelEn: 'Pharmacy On Duty', labelFr: 'Pharmacie de Garde', color: '#D6455A' },
  { key: 'vehicles', hintEn: 'Cars, motorbikes, parts', hintFr: 'Voitures, motos, pièces', icon: 'car-sport-outline', labelEn: 'Vehicles', labelFr: 'Véhicules', color: '#2F6BB5' },
  { key: 'realEstate', hintEn: 'Rent, buy, land', hintFr: 'Louer, acheter, terrains', icon: 'home-outline', labelEn: 'Real Estate & Rentals', labelFr: 'Immobilier & Locations', color: '#12908C' },
  { key: 'electronics', hintEn: 'Phones, computers, TVs', hintFr: 'Téléphones, ordinateurs, TV', icon: 'phone-portrait-outline', labelEn: 'Electronics', labelFr: 'Électronique', color: '#6A5AE0' },
  { key: 'fashion', hintEn: 'Clothes, shoes, fabric', hintFr: 'Vêtements, chaussures, pagnes', icon: 'shirt-outline', labelEn: 'Fashion & Apparel', labelFr: 'Mode & Vêtements', color: '#C4478A' },
  { key: 'homeGarden', hintEn: 'Kitchen, appliances, decor, plants', hintFr: 'Cuisine, électroménager, déco, plantes', icon: 'flower-outline', labelEn: 'Decor & Garden', labelFr: 'Déco & Jardin', color: '#5BA83A' },
  { key: 'furniture', hintEn: 'Beds, sofas, wardrobes, mattresses', hintFr: 'Lits, canapés, armoires, matelas', icon: 'bed-outline', labelEn: 'Furniture & Bedding', labelFr: 'Meubles & Literie', color: '#A0703F' },
  { key: 'babyKids', hintEn: 'Prams, clothes, toys', hintFr: 'Poussettes, vêtements, jouets', icon: 'balloon-outline', labelEn: 'Baby & Kids', labelFr: 'Bébé & Enfants', color: '#E8768F' },
  { key: 'sports', hintEn: 'Bikes, gear, outdoors', hintFr: 'Vélos, équipements, plein air', icon: 'football-outline', labelEn: 'Sports & Outdoors', labelFr: 'Sport & Plein air', color: '#EC8B2B' },
  { key: 'agriculture', hintEn: 'Seeds, tools, livestock', hintFr: 'Semences, outils, bétail', icon: 'leaf-outline', labelEn: 'Agriculture', labelFr: 'Agriculture', color: '#8FA030' },
  { key: 'restaurants', hintEn: 'Your restaurant or maquis', hintFr: 'Votre restaurant ou maquis', icon: 'restaurant-outline', labelEn: 'Restaurants', labelFr: 'Restaurants', color: '#D2603A' },
  { key: 'services', hintEn: 'Plumbing, hairdressing, transport', hintFr: 'Plomberie, coiffure, transport', icon: 'construct-outline', labelEn: 'Services', labelFr: 'Services', color: '#6B7A94' },
  { key: 'community', hintEn: 'Notices, events, mutual help', hintFr: 'Annonces, événements, entraide', icon: 'people-outline', labelEn: 'Community', labelFr: 'Communauté', color: '#1A9AAC' },
  { key: 'jobs', hintEn: 'Job offers and gigs', hintFr: 'Offres d’emploi et missions', icon: 'briefcase-outline', labelEn: 'Jobs', labelFr: 'Emplois', color: '#12876A' },
];
