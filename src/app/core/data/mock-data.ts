import { Listing, ListingStatus } from '@core/models/listing.model';

export const NGO_LIST = [
  'Hope Community Kitchen',
  'Sunrise Shelter',
  'New Path NGO',
  'Asha Foundation',
  'Seva Bhavan',
];

export const VOLUNTEER_NAMES = [
  'Priya Sharma',
  'Arjun Mehta',
  'Kavya Iyer',
  'Rohit Verma',
  'Sneha Gupta',
];

export interface NearbyReceiver {
  name: string;
  dist: number;
  active: boolean;
}

export const NEARBY_RECEIVERS: NearbyReceiver[] = [
  { name: 'Hope Community Kitchen', dist: 1.2, active: true },
  { name: 'Sunrise Shelter', dist: 2.6, active: true },
  { name: 'Asha Foundation', dist: 3.4, active: true },
  { name: 'Seva Bhavan', dist: 4.1, active: false },
  { name: 'New Path NGO', dist: 4.8, active: true },
];

export interface Account {
  id: number;
  name: string;
  type: 'Volunteer' | 'Organization';
  city: string;
  status: 'verified' | 'pending' | 'suspended';
  joined: string;
}

export const ACCOUNTS: Account[] = [
  { id: 1, name: 'Priya Sharma', type: 'Volunteer', city: 'Ahmedabad', status: 'verified', joined: '2 months ago' },
  { id: 2, name: 'Arjun Mehta', type: 'Volunteer', city: 'Ahmedabad', status: 'pending', joined: '2 days ago' },
  { id: 3, name: 'Hope Community Kitchen', type: 'Organization', city: 'Ahmedabad', status: 'verified', joined: '3 months ago' },
  { id: 4, name: 'Sunrise Shelter', type: 'Organization', city: 'Ahmedabad', status: 'pending', joined: '1 day ago' },
  { id: 5, name: 'Kavya Iyer', type: 'Volunteer', city: 'Ahmedabad', status: 'pending', joined: '6 hours ago' },
  { id: 6, name: 'New Path NGO', type: 'Organization', city: 'Ahmedabad', status: 'suspended', joined: '5 months ago' },
];

export interface Dispute {
  id: number;
  listing: string;
  raisedBy: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved';
}

export const DISPUTES: Dispute[] = [
  { id: 1, listing: 'Riverside Banquet Hall', raisedBy: 'Hope Community Kitchen', reason: 'Delivery marked complete but food never arrived', priority: 'high', status: 'open' },
  { id: 2, listing: 'Green Leaf Bakery', raisedBy: 'Arjun Mehta', reason: 'Recipient unreachable at drop-off location', priority: 'medium', status: 'open' },
  { id: 3, listing: 'Sunshine Cafe', raisedBy: 'Sunshine Cafe', reason: 'Quantity received did not match the listing', priority: 'low', status: 'open' },
];

function mk(
  id: number,
  donor: string,
  foodType: Listing['foodType'],
  mealType: Listing['mealType'],
  quantity: string,
  freshness: string,
  pickupTime: string,
  address: string,
  status: ListingStatus,
  volunteer: string | null,
): Listing {
  const matched = status === 'delivered' || status === 'confirmed' || status === 'pickedup';
  return {
    id,
    donor,
    foodType,
    mealType,
    quantity,
    freshness,
    pickupTime,
    address,
    status,
    volunteer,
    recipient: matched ? NGO_LIST[id % NGO_LIST.length] : null,
    notes: 'Please bring insulated containers if possible.',
  };
}

export const INITIAL_LISTINGS: Listing[] = [
  mk(1, 'Grand Plaza Hotel', 'Veg', 'Lunch', '40 servings', 'Just Cooked', '1:00 PM - 2:00 PM', 'MG Road', 'claimed', 'Priya Sharma'),
  mk(2, 'Riverside Banquet Hall', 'Non-Veg', 'Dinner', '75 servings', '2 Hours Old', '8:00 PM - 9:30 PM', 'Riverside Ave', 'pending', null),
  mk(3, 'Green Leaf Bakery', 'Veg', 'Snacks', '60 units', 'Packed Food', '5:00 PM - 6:00 PM', 'Market Street', 'confirmed', 'Arjun Mehta'),
  mk(4, 'Sunshine Cafe', 'Veg', 'Breakfast', '30 servings', 'Just Cooked', '8:00 AM - 9:00 AM', 'Park Street', 'delivered', 'Kavya Iyer'),
  mk(5, 'City Wedding Hall', 'Non-Veg', 'Dinner', '120 servings', 'Just Cooked', '10:00 PM - 11:00 PM', 'Ring Road', 'pickedup', 'Priya Sharma'),
  mk(6, 'Daily Fresh Mart', 'Veg', 'Snacks', '25 units', 'Packed Food', '4:00 PM - 5:00 PM', 'Station Road', 'expired', null),
];
