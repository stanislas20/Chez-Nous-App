import { normalizeJobListing } from "./normalizeJobListing";

// A single place that decides whether tapping a listing should open the
// generic ProductDetailScreen or the job-specific JobDetailScreen. Every
// screen that renders a real listing that could be a job posting
// (categoryKey: 'jobs') should route taps through this instead of
// navigating to ProductDetail directly — a job posting has no seller/price
// to show and its own dedicated apply flow, so sending it to ProductDetail
// silently loses all of that (and shows nonsense copy like "Contacter le
// vendeur" on something that isn't a sale).
export function openListing(navigation, listing, t, language) {
  // Pharmacies get their own screen rather than the goods detail: no price,
  // no condition, and the thing that matters is a phone number someone can
  // dial at 2am.
  if (listing.categoryKey === "pharmacyOnDuty") {
    navigation.navigate("PharmacyDetail", { listing: { ...listing, createdAt: null } });
    return;
  }
  // Property has its own detail screen — specs table, document tier,
  // move-in total. Routing it to the goods screen from every entry point
  // except the Immobilier directory meant the same listing showed two
  // different screens depending on where it was tapped, and the goods one
  // silently dropped everything a property listing carries.
  if (listing.categoryKey === "realEstate") {
    navigation.navigate("RealEstateDetail", { listing: { ...listing, createdAt: null } });
    return;
  }
  if (listing.categoryKey === "jobs") {
    navigation.navigate("JobDetail", { job: normalizeJobListing(listing, t, language) });
  } else {
    navigation.navigate("ProductDetail", { listing: { ...listing, createdAt: null } });
  }
}
