/* ============================================================
   SHAX STORE — Main JavaScript
   Handles: i18n, products, categories, cart, auth, reviews,
            search, checkout, animations.

   All data (products, categories, orders, reviews, auth) is
   fetched from the backend API — nothing is hardcoded here.
   ============================================================ */

'use strict';

/* API origin:
   - On the website, requests are same-origin relative (/api).
   - Inside the bundled Capacitor app the WebView origin is a local scheme
     with no backend behind it, so API calls use the origin set in
     shax-native-config.js (window.ShaxNativeConfig.apiBase) when provided,
     otherwise same-origin /api. Only a public HTTPS URL is ever used —
     never secrets or credentials. */
const API_BASE = (function () {
  try {
    if (typeof window !== 'undefined' &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()) {
      const cfg = window.ShaxNativeConfig && window.ShaxNativeConfig.apiBase;
      if (typeof cfg === 'string' && cfg.trim()) return cfg.replace(/\/+$/, '');
    }
  } catch (e) { /* fall through to same-origin */ }
  return '/api';
})();

/* ─── ASSET PATHS ──────────────────────────────────────── */
const PLACEHOLDER_PRODUCT  = 'assets/placeholder-product.png';
const PLACEHOLDER_CATEGORY = 'assets/placeholder-category.png';
const ALL_CATEGORY_ICON    = 'assets/icon-all.png';

/* ─── TRANSLATIONS ─────────────────────────────────────── */
const TRANSLATIONS = {
  en: {
    dir: 'ltr',
    nav_home: 'Home',
    nav_products: 'Products',
    nav_about: 'About',
    nav_contact: 'Contact',
    search_placeholder: 'Search products...',
    cart_title: 'Your Cart',
    cart_empty: 'Your cart is empty',
    cart_empty_sub: 'Add some products to get started!',
    cart_subtotal: 'Subtotal',
    cart_shipping: 'Shipping',
    cart_total: 'Total',
    cart_free_shipping: 'FREE',
    shipping_label: 'Shipping',
    free_shipping_label: 'Free shipping',
    checkout: 'Checkout',
    continue_shopping: 'Continue Shopping',
    add_to_cart: 'Add to Cart',
    buy_now: 'Buy Now',
    login: 'Login',
    signup: 'Sign Up',
    logout: 'Logout',
    my_orders: 'My Orders',
    hero_eyebrow: 'Premium Gym Wear — Kurdistan - iraq',
    hero_headline_1: 'YOUR',
    hero_headline_2: 'POWER',
    hero_headline_3: 'OUR STYLE',
    hero_desc: 'Find your dream fit, See how your muscles pump from our fits shera',
    hero_cta_shop: 'Shop Now',
    hero_cta_about: 'Our Story',
    bolt_label: 'Power Up',
    bolt_label2: 'Your Game',
    bolt_sub: 'Premium gear, delivered fast across Kurdistan',
    shirt_cta: 'View Collection',
    tap_to_spark: 'Drag to rotate · tap to spark',
    language_label: 'Language',
    badge_1: 'Premium Quality',
    badge_2: 'Fast Delivery',
    badge_3: 'Pro Grade',
    cat_title: 'Shop By',
    cat_all: 'All',
    products_title: 'Our',
    products_subtitle: 'You can find the product that you are looking for better with the filter options.',
    filter_all: 'All',
    sort_popular: 'Best Sellers',
    sort_price_asc: 'Price: Low to High',
    sort_price_desc: 'Price: High to Low',
    sort_new: 'Newest',
    size_label: 'Select Size',
    qty_label: 'Quantity',
    about_title: 'About',
    about_title2: 'Shax Store',
    about_badge: 'Made for Champions',
    about_p1: 'Shax Store was born from a passion for fitness and a desire to bring world-class gym apparel to Kurdistan. Every product is chosen for its quality, durability, and performance.',
    about_p2: 'We believe that great training starts with the right gear.',
    stat_products: 'Products',
    stat_customers: 'Happy Customers',
    stat_years: 'Years Experience',
    footer_desc: 'If you have any suggestions, we would be happy to get in touch with you.',
    footer_links: 'Quick Links',
    footer_support: 'Support',
    footer_contact: 'Contact',
    faq: 'FAQ',
    returns: 'Returns',
    size_guide: 'Size Guide',
    shipping_info: 'Shipping Info',
    footer_location: 'Erbil, Kurdistan',
    shipping_subtitle: 'Everything you need to know about delivery',
    shipping_empty: 'Shipping information will be posted here soon.',
    shipping_error: 'Could not load shipping information. Please try again later.',
    loading: 'Loading…',
    sign_in: 'Sign In',
    terms: 'Terms & Conditions',
    privacy: 'Privacy Policy',
    copy: '© 2026 Shax Store. All rights reserved.',
    in_stock: 'In Stock',
    out_of_stock: 'Out of Stock',
    in_stock_count: 'in stock',
    new_label: 'New',
    bestseller: 'Best Seller',
    currency: 'IQD',
    checkout_title: 'Complete Order',
    checkout_name: 'Full Name',
    checkout_phone: 'Phone Number',
    checkout_address: 'Delivery Address',
    checkout_city: 'City',
    checkout_note: 'Order Note (optional)',
    checkout_submit: 'Place Order',
    checkout_note_bot: 'Your order will be sent straight to our team.',
    checkout_choose_city: 'Choose your city',
    city_erbil: 'Erbil',
    city_slemani: 'Slemani',
    city_duhok: 'Duhok',
    checkout_location: 'Location (optional)',
    checkout_send_location: 'Send My Location',
    choose_city_error: 'Please choose your city.',
    location_unsupported: 'Location is not supported on this device.',
    location_getting: 'Getting your location…',
    location_shared: 'Location shared!',
    location_update: 'Update My Location',
    location_denied: 'Location permission denied. Turn on location and try again.',
    location_timeout: 'Could not get location in time. Try again.',
    cancel_order: 'Cancel Order',
    cancel_order_confirm: 'Cancel this order? This permanently removes it.',
    cancel_order_done: 'Your order has been cancelled.',
    order_success: "Order placed! We'll contact you soon.",
    order_failed: 'Could not place your order. Please try again.',
    sign_in_required: 'Please sign in to continue.',
    welcome_back: 'Welcome back!',
    account: 'My Account',
    no_results: 'No products found.',
    select_size: 'Please select a size.',
    select_color: 'Please select a color.',
    min_order_msg: 'Minimum order is',
    add: 'add',
    more_to_order: 'more to order',
    color_label: 'Color',
    fill_required: 'Please fill in all required fields.',
    invalid_credentials: 'Invalid email or password.',
    passwords_no_match: 'Passwords do not match.',
    email_taken: 'Email already registered.',
    network_error: 'Network error. Please try again.',
    session_expired: 'Your session has expired. Please log in again.',
    /* Notifications */
    notifications_title: 'Notifications',
    notif_empty: 'No notifications yet.',
    notif_empty_sub: 'When there is news, it will appear here.',
    notif_load_error: 'Unable to load notifications. Please try again.',
    notif_retry: 'Retry',
    notif_mark_all_read: 'Mark all as read',
    notif_type_general: 'General',
    notif_type_product: 'Product',
    notif_type_category: 'Category',
    notif_type_order: 'Order',
    notif_type_account: 'Account',
    notif_type_promotion: 'Promotion',
    notif_type_system: 'System',
    notif_unread_count: 'Unread notifications',
    notif_close: 'Close notifications',
    notif_open_notifications: 'Open notifications',
    notif_marked_read: 'Notification marked as read',
    notif_all_read: 'All notifications marked as read',
    notif_just_now: 'Just now',
    notif_view: 'View',
    /* Reviews */
    reviews_title: 'Ratings & Reviews',
    write_review: 'Write a Review',
    your_rating: 'Your Rating',
    your_comment_placeholder: 'Share your thoughts about this product (optional)...',
    submit_review: 'Submit Review',
    review_saved: 'Thanks for your review!',
    review_deleted: 'Review deleted.',
    sign_in_to_review: 'Sign in to leave a rating and comment.',
    no_reviews_yet: 'No reviews yet — be the first!',
    reviews_loading: 'Loading reviews…',
    rating_required: 'Please select a rating.',
    reviews_count_suffix: 'reviews',
    review_count_suffix_one: 'review',
    delete_review: 'Delete',
    confirm_delete_review: 'Delete this review?',
    clear_rating: 'Clear',
    /* Account page */
    order_history: 'Order History',
    orders_label: 'Orders',
    total_spent_label: 'Total Spent',
    back_to_store: 'Back to Store',
    shop_now: 'Shop Now',
    no_orders: 'No orders yet.',
    no_orders_sub: 'Start shopping and your orders will appear here!',
    member_label: 'Member',
    admin_label: 'Admin',
    status_pending: 'Pending',
    status_processing: 'Processing',
    status_shipped: 'Shipped',
    status_delivered: 'Delivered',
    status_cancelled: 'Cancelled',
    order_status_title: 'Order update',
    order_msg_pending: 'Your order {id} was received.',
    order_msg_processing: 'Your order {id} is being prepared.',
    order_msg_shipped: 'Your order {id} is on the way.',
    order_msg_delivered: 'Your order {id} has been delivered.',
    order_msg_cancelled: 'Your order {id} was cancelled.',
    track_order: 'Track Order',
    track_title: 'Order Tracking',
    track_close: 'Close',
    track_current: 'Current status',
    track_deliver_to: 'Deliver to',
    track_items: 'Items',
    track_total: 'Total',
    track_shipping: 'Shipping',
    track_no_timeline: 'No tracking history yet.',
    track_failed: 'Failed to load tracking for this order.',
    order_items_label: 'Items',
    order_size_label: 'Size',
    order_total_label: 'Total',
    /* Guest browsing prompt */
    guest_welcome: 'Welcome to Shax Store',
    guest_tagline: 'Create an account for faster checkout, order tracking and a personalised shopping experience. You can also keep browsing as a guest.',
    guest_signin: 'Sign In',
    guest_create: 'Create Account',
    guest_continue: 'Continue as Guest',
  },
  ku: {
    dir: 'rtl',
    nav_home: 'سەرەکی',
    nav_products: 'بەرهەمەکان',
    nav_about: 'دەربارەمان',
    nav_contact: 'پەیوەندی',
    search_placeholder: 'گەڕان بە بەرهەمەکان...',
    cart_title: 'سەبەتەکەت',
    cart_empty: 'سەبەتەکەت بەتاڵە',
    cart_empty_sub: 'بەرهەمێک زیاد بکە بۆ دەستپێکردن!',
    cart_subtotal: 'کۆی گشتی',
    cart_shipping: 'گواستنەوە',
    cart_total: 'کۆی تەواو',
    cart_free_shipping: 'بەخۆڕایی',
    shipping_label: 'گەیاندن',
    free_shipping_label: 'گەیاندنی بەخۆڕایی',
    checkout: 'کڕین',
    continue_shopping: 'بەردەوام بە گەڕان',
    add_to_cart: 'زیادکردن بۆ سەبەتە',
    buy_now: 'ئێستا بکڕە',
    login: 'چوونەژوورەوە',
    signup: 'تۆمارکردن',
    logout: 'دەرچوون',
    my_orders: 'فەرمانەکانم',
    hero_eyebrow: 'جلی تایبەت بۆ وەرزشکاران — کوردستان - ئێراق',
    hero_headline_1: 'هێزی تۆ',
    hero_headline_2: 'ستایلی',
    hero_headline_3: 'ئێمە',
    hero_desc: 'جلی خەونەکانت بدۆزەوە، ببینە چۆن ماسولکەکانت پەمپ دەبن شێرە',
    hero_cta_shop: 'ئێستا بکڕە',
    hero_cta_about: 'چیرۆکمان',
    bolt_label: 'یاریەکانت',
    bolt_label2: 'بەهێزتر بکە',
    bolt_sub: 'کەرەستەی نایاب بە خێرایی لە سەرانسەری کوردستان دەگات',
    shirt_cta: 'بینینی کۆلێکشن',
    tap_to_spark: 'ڕایبکێشە بۆ سووڕانەوە · بیکە بۆ بریسکە',
    language_label: 'زمان',
    badge_1: 'کوالیتی بەرز',
    badge_2: 'گەیاندنی خێرا',
    badge_3: 'پایەی پیشەیی',
    cat_title: 'گەڕان بەپێی',
    cat_all: 'هەموو',
    products_title: 'بەرهەمەکانمان',
    products_subtitle: 'دەتوانی بە فلتەر کردن باشتر ئەوەی دەتەوێ بیدۆزیەوە',
    filter_all: 'هەموو',
    sort_popular: 'باشترین فرۆشراوەکان',
    sort_price_asc: 'نرخ: کەم بۆ زۆر',
    sort_price_desc: 'نرخ: زۆر بۆ کەم',
    sort_new: 'نوێترین',
    size_label: 'قەبارە هەڵبژێرە',
    qty_label: 'ژمارە',
    about_title: 'دەربارەی',
    about_title2: 'شاخ ستۆر',
    about_badge: 'بۆ قەهرەمانان',
    about_p1: 'شاخ ستۆر لە خۆشەویستی بۆ فیتنێس دروستبوو. هەموو بەرهەمێک بۆ کوالێتیەوە هەڵبژێردراوە',
    about_p2: 'لای ئێمە وایە بۆ بەردەوامیدان بە ڕاهێنانەکانت پێویستە پێداویستی تەواوت هەبێ',
    stat_products: 'بەرهەم',
    stat_customers: 'کڕیاری دڵخۆش',
    stat_years: 'ئەزموون',
    footer_desc: 'هەر پێشنیارێکتان هەبوو دەتوانن ئاگادارمان بکەنەوە',
    footer_links: 'بەستەری خێرا',
    footer_support: 'پشتگیری',
    footer_contact: 'پەیوەندی',
    faq: 'پرسیارە باوەکان',
    returns: 'گەڕاندنەوە',
    size_guide: 'ڕێنمایی قەبارە',
    shipping_info: 'زانیاری گەیاندن',
    footer_location: 'هەولێر، کوردستان',
    shipping_subtitle: 'هەموو ئەو شتانەی پێویستە دەربارەی گەیاندن بیانزانیت',
    shipping_empty: 'زانیاری گەیاندن بەم زووانە لێرە دادەنرێت.',
    shipping_error: 'نەتوانرا زانیاری گەیاندن باربکرێت. تکایە دواتر هەوڵ بدەرەوە.',
    loading: 'بارکردن…',
    sign_in: 'چوونەژوورەوە',
    terms: 'مەرج و بەندەکان',
    privacy: 'پرایڤەسی',
    copy: '© ٢٠٢٦ شاخ ستۆر. هەموو مافەکان پارێزراون.',
    in_stock: 'بەردەستە',
    out_of_stock: 'نیە',
    in_stock_count: 'لە کۆگادا',
    new_label: 'نوێ',
    bestseller: 'باشترین فرۆش',
    currency: 'د.ع',
    checkout_title: 'تەواوکردنی داواکاری',
    checkout_name: 'ناوی تەواو',
    checkout_phone: 'ژمارەی مۆبایل',
    checkout_address: 'ناونیشانی گەیاندن',
    checkout_city: 'شار',
    checkout_note: 'تێبینی (ئارەزوومەندانە)',
    checkout_submit: 'داواکاری بنێرە',
    checkout_note_bot: 'داواکارییەکەت ڕاستەوخۆ بۆ تیمەکەمان دەنێردرێت.',
    checkout_choose_city: 'شارەکەت هەڵبژێرە',
    city_erbil: 'هەولێر',
    city_slemani: 'سلێمانی',
    city_duhok: 'دهۆک',
    checkout_location: 'شوێن (ئارەزوومەندانە)',
    checkout_send_location: 'شوێنەکەم بنێرە',
    choose_city_error: 'تکایە شارەکەت هەڵبژێرە.',
    location_unsupported: 'شوێن لەسەر ئەم ئامێرە پشتگیری ناکرێت.',
    location_getting: 'وەرگرتنی شوێنەکەت…',
    location_shared: 'شوێن نێردرا!',
    location_update: 'نوێکردنەوەی شوێن',
    location_denied: 'ڕێگەی شوێن ڕەتکرایەوە. شوێن چالاک بکە و دووبارە هەوڵبدە.',
    location_timeout: 'نەتوانرا شوێن بەدەستبهێنرێت. دووبارە هەوڵبدە.',
    cancel_order: 'هەڵوەشاندنەوەی داواکاری',
    cancel_order_confirm: 'ئەم داواکارییە هەڵبوەشێنرێتەوە؟ بە تەواوی دەسڕێتەوە.',
    cancel_order_done: 'داواکارییەکەت هەڵوەشایەوە.',
    order_success: 'داواکاری ناردرا! بەم زوانە پەیوەندیت پێوەدەکەین.',
    order_failed: 'نەتوانرا داواکاریەکەت بنێردرێت. تکایە دووبارە هەوڵبدەرەوە.',
    sign_in_required: 'تکایە چوونەژوورەوە بکە بۆ بەردەوامبوون.',
    welcome_back: 'بەخێربێیتەوە!',
    account: 'ئەکاونتم',
    no_results: 'هیچ بەرهەمێک نەدۆزرایەوە.',
    select_size: 'تکایە قەبارەیەک هەڵبژێرە.',
    select_color: 'تکایە ڕەنگێک هەڵبژێرە.',
    min_order_msg: 'کەمترین داواکاری بریتییە لە',
    add: 'زیاد بکە',
    more_to_order: 'زیاتر بۆ داواکردن',
    color_label: 'ڕەنگ',
    fill_required: 'تکایە هەموو خانە پێویستەکان پڕبکەرەوە.',
    invalid_credentials: 'ئیمەیل یان وشەی نهێنی هەڵەیە.',
    passwords_no_match: 'وشە نهێنییەکان وەک یەک نین.',
    email_taken: 'ئەم ئیمەیلە پێشتر تۆمارکراوە.',
    network_error: 'هەڵەی تۆڕ. تکایە دووبارە هەوڵبدەرەوە.',
    /* Notifications */
    notifications_title: 'ئاگانامەکان',
    notif_empty: 'هێشتا هیچ ئاگانامەیەک نییە.',
    notif_empty_sub: 'کاتێک هەواڵ هەبێت، لێرە دەردەکەوێت.',
    notif_load_error: 'نەتوانرا ئاگانامەکان باربکرێن. تکایە دووبارە هەوڵبدەرەوە.',
    notif_retry: 'دووبارە هەوڵبدەرەوە',
    notif_mark_all_read: 'هەموو وەک خوێندراوە نیشان بکە',
    notif_type_general: 'گشتی',
    notif_type_product: 'بەرهەم',
    notif_type_category: 'پۆل',
    notif_type_order: 'داواکاری',
    notif_type_account: 'هەژمار',
    notif_type_promotion: 'تایبەتمەندی',
    notif_type_system: 'سیستەم',
    notif_unread_count: 'ئاگانامە نەخوێندراوەکان',
    notif_close: 'داخستنی ئاگانامەکان',
    notif_open_notifications: 'کردنەوەی ئاگانامەکان',
    notif_marked_read: 'ئاگانامە وەک خوێندراوە نیشانکرا',
    notif_all_read: 'هەموو ئاگانامەکان وەک خوێندراوە نیشانکران',
    notif_just_now: 'ئێستا',
    session_expired: 'دانیشتنەکەت بەسەرچووە. تکایە دووبارە بچۆرەژوورەوە.',
    reviews_title: 'هەڵسەنگاندن و بۆچوونەکان',
    write_review: 'بۆچوونێک بنووسە',
    your_rating: 'هەڵسەنگاندنی تۆ',
    your_comment_placeholder: 'بۆچوونت دەربارەی ئەم بەرهەمە بنووسە (ئارەزووی)...',
    submit_review: 'ناردنی بۆچوون',
    review_saved: 'سوپاس بۆ بۆچوونەکەت!',
    review_deleted: 'بۆچوونەکە سڕایەوە.',
    sign_in_to_review: 'بۆ نووسینی هەڵسەنگاندن و بۆچوون بچۆرە ژوورەوە.',
    no_reviews_yet: 'هێشتا هیچ بۆچوونێک نییە — یەکەم کەس بە!',
    reviews_loading: 'بارکردنی بۆچوونەکان…',
    rating_required: 'تکایە هەڵسەنگاندنێک هەڵبژێرە.',
    reviews_count_suffix: 'بۆچوون',
    review_count_suffix_one: 'بۆچوون',
    delete_review: 'سڕینەوە',
    confirm_delete_review: 'ئەم بۆچوونە بسڕدرێتەوە؟',
    clear_rating: 'پاککردنەوە',
    /* Account page */
    order_history: 'مێژووی فەرمانەکان',
    orders_label: 'فەرمان',
    total_spent_label: 'کۆی خەرجکراو',
    back_to_store: 'گەڕانەوە بۆ فرۆشگا',
    shop_now: 'ئێستا بکڕە',
    no_orders: 'هیچ فەرمانێک نیە.',
    no_orders_sub: 'دەستبکە بە کڕین و فەرمانەکانت ئێرە دەردەکەون!',
    member_label: 'ئەندام',
    admin_label: 'ئەدمین',
    status_pending: 'چاوەڕوان',
    status_processing: 'پرۆسەکردن',
    status_shipped: 'ناردرا',
    status_delivered: 'گەیشتووە',
    status_cancelled: 'هەڵوەشاندرا',
    order_status_title: 'ئاگاداری داواکاری',
    order_msg_pending: 'داواکاری {id} وەرگیرا.',
    order_msg_processing: 'داواکاری {id} ئامادە دەکرێت.',
    order_msg_shipped: 'داواکاری {id} لە ڕێگایە.',
    order_msg_delivered: 'داواکاری {id} گەیشتووە.',
    order_msg_cancelled: 'داواکاری {id} هەڵوەشایەوە.',
    track_order: 'بەدواداچوونی داواکاری',
    track_title: 'بەدواداچوونی داواکاری',
    track_close: 'داخستن',
    track_current: 'باری ئێستا',
    track_deliver_to: 'گەیاندن بۆ',
    track_items: 'کاڵا',
    track_total: 'کۆی گشتی',
    track_shipping: 'گواستنەوە',
    track_no_timeline: 'هێشتا مێژووێکی بەدواداچوون نییە.',
    track_failed: 'نەتوانرا بەدواداچوونی داواکاری باربکرێت.',
    order_items_label: 'کاڵا',
    order_size_label: 'قەبارە',
    order_total_label: 'کۆی تەواو',
    /* Guest browsing prompt */
    guest_welcome: 'بەخێربێیت بۆ شاکس ستۆر',
    guest_tagline: 'هەژمارێک دروست بکە بۆ کڕینێکی خێراتر و شوێنکەوتنی فەرمانەکان. هەروەها دەتوانیت وەک میوان بەردەوام بیت لە گەڕان.',
    guest_signin: 'چوونەژوورەوە',
    guest_create: 'دروستکردنی هەژمار',
    guest_continue: 'بەردەوام بە وەک میوان',
  },
  ar: {
    dir: 'rtl',
    nav_home: 'الرئيسية',
    nav_products: 'المنتجات',
    nav_about: 'من نحن',
    nav_contact: 'تواصل معنا',
    search_placeholder: 'البحث عن منتجات...',
    cart_title: 'سلة التسوق',
    cart_empty: 'سلتك فارغة',
    cart_empty_sub: 'أضف منتجات للبدء!',
    cart_subtotal: 'المجموع الفرعي',
    cart_shipping: 'الشحن',
    cart_total: 'الإجمالي',
    cart_free_shipping: 'مجاني',
    shipping_label: 'الشحن',
    free_shipping_label: 'شحن مجاني',
    checkout: 'إتمام الشراء',
    continue_shopping: 'مواصلة التسوق',
    add_to_cart: 'أضف إلى السلة',
    buy_now: 'اشتر الآن',
    login: 'تسجيل الدخول',
    signup: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    my_orders: 'طلباتي',
    hero_eyebrow: 'ملابس رياضية رائعة — كردستان - العراق',
    hero_headline_1: 'قوتك',
    hero_headline_2: 'وستايلنا',
    hero_headline_3: 'للملابس',
    hero_desc: 'اعثر على المقاس المثالي لأحلامك، شاهد عضلاتك وهي تتضخ من ملابسنا یا اسد',
    hero_cta_shop: 'تسوق الآن',
    hero_cta_about: 'قصتنا',
    bolt_label: 'انطلق',
    bolt_label2: 'بقوة',
    bolt_sub: 'منتجات مميزة، توصيل سريع في كردستان',
    shirt_cta: 'عرض المجموعة',
    tap_to_spark: 'اسحب للتدوير · انقر للوميض',
    language_label: 'اللغة',
    badge_1: 'جودة فاخرة',
    badge_2: 'توصيل سريع',
    badge_3: 'درجة احترافية',
    cat_title: 'تسوق حسب',
    cat_all: 'الكل',
    products_title: 'منتجاتنا',
    products_subtitle: 'يمكنك العثور على المنتج الذي تبحث عنه بشكل أفضل باستخدام خيارات الفلترة.',
    filter_all: 'الكل',
    sort_popular: 'الأكثر مبيعاً',
    sort_price_asc: 'السعر: من الأقل للأعلى',
    sort_price_desc: 'السعر: من الأعلى للأقل',
    sort_new: 'الأحدث',
    size_label: 'اختر المقاس',
    qty_label: 'الكمية',
    about_title: 'عن',
    about_title2: 'متجر شاكس',
    about_badge: 'صُنع للأبطال',
    about_p1: 'وُلد متجر شاكس من شغف بالياقة البدنية ورغبة في جلب ملابس رياضية عالمية المستوى إلى كردستان.',
    about_p2: 'نحن نؤمن أن التدريب الجيد يبدأ بالمعدات الصحيحة.',
    stat_products: 'منتج',
    stat_customers: 'عميل سعيد',
    stat_years: 'سنة خبرة',
    footer_desc: 'إذا كان لديك أي اقتراحات، فسوف نكون سعداء بالتواصل معك.',
    footer_links: 'روابط سريعة',
    footer_support: 'الدعم',
    footer_contact: 'اتصل بنا',
    faq: 'الأسئلة الشائعة',
    returns: 'المرتجعات',
    size_guide: 'دليل المقاسات',
    shipping_info: 'معلومات الشحن',
    footer_location: 'أربيل، كردستان',
    shipping_subtitle: 'كل ما تحتاج معرفته عن التوصيل',
    shipping_empty: 'سيتم نشر معلومات الشحن هنا قريباً.',
    shipping_error: 'تعذّر تحميل معلومات الشحن. يرجى المحاولة لاحقاً.',
    loading: 'جارٍ التحميل…',
    sign_in: 'تسجيل الدخول',
    terms: 'الشروط والأحكام',
    privacy: 'سياسة الخصوصية',
    copy: '© ٢٠٢٦ متجر شاكس. جميع الحقوق محفوظة.',
    in_stock: 'متوفر',
    out_of_stock: 'غير متوفر',
    in_stock_count: 'متوفر',
    new_label: 'جديد',
    bestseller: 'الأكثر مبيعاً',
    currency: 'د.ع',
    checkout_title: 'إتمام الطلب',
    checkout_name: 'الاسم الكامل',
    checkout_phone: 'رقم الهاتف',
    checkout_address: 'عنوان التوصيل',
    checkout_city: 'المدينة',
    checkout_note: 'ملاحظة (اختياري)',
    checkout_submit: 'إرسال الطلب',
    checkout_note_bot: 'سيتم إرسال طلبك مباشرة إلى فريقنا.',
    checkout_choose_city: 'اختر مدينتك',
    city_erbil: 'أربيل',
    city_slemani: 'السليمانية',
    city_duhok: 'دهوك',
    checkout_location: 'الموقع (اختياري)',
    checkout_send_location: 'إرسال موقعي',
    choose_city_error: 'الرجاء اختيار مدينتك.',
    location_unsupported: 'الموقع غير مدعوم على هذا الجهاز.',
    location_getting: 'جارٍ تحديد موقعك…',
    location_shared: 'تم إرسال الموقع!',
    location_update: 'تحديث موقعي',
    location_denied: 'تم رفض إذن الموقع. فعّل الموقع وحاول مجدداً.',
    location_timeout: 'تعذّر تحديد الموقع في الوقت المناسب. حاول مجدداً.',
    cancel_order: 'إلغاء الطلب',
    cancel_order_confirm: 'إلغاء هذا الطلب؟ سيتم حذفه نهائياً.',
    cancel_order_done: 'تم إلغاء طلبك.',
    order_success: 'تم إرسال الطلب! سنتصل بك قريباً.',
    order_failed: 'تعذّر إرسال طلبك. حاول مرة أخرى.',
    sign_in_required: 'الرجاء تسجيل الدخول للمتابعة.',
    welcome_back: 'أهلاً بعودتك!',
    account: 'حسابي',
    no_results: 'لا توجد منتجات.',
    select_size: 'الرجاء اختيار المقاس.',
    select_color: 'الرجاء اختيار اللون.',
    min_order_msg: 'الحد الأدنى للطلب هو',
    add: 'أضف',
    more_to_order: 'المزيد للطلب',
    color_label: 'اللون',
    fill_required: 'الرجاء تعبئة جميع الحقول المطلوبة.',
    invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    passwords_no_match: 'كلمتا المرور غير متطابقتين.',
    email_taken: 'هذا البريد الإلكتروني مسجل بالفعل.',
    network_error: 'خطأ في الشبكة. حاول مرة أخرى.',
    session_expired: 'انتهت جلستك. الرجاء تسجيل الدخول مرة أخرى.',
    /* Notifications */
    notifications_title: 'الإشعارات',
    notif_empty: 'لا توجد إشعارات بعد.',
    notif_empty_sub: 'عندما يكون هناك خبر، سيظهر هنا.',
    notif_load_error: 'تعذّر تحميل الإشعارات. حاول مرة أخرى.',
    notif_retry: 'إعادة المحاولة',
    notif_mark_all_read: 'تحديد الكل كمقروء',
    notif_type_general: 'عام',
    notif_type_product: 'منتج',
    notif_type_category: 'فئة',
    notif_type_order: 'طلب',
    notif_type_account: 'حساب',
    notif_type_promotion: 'ترويج',
    notif_type_system: 'نظام',
    notif_unread_count: 'الإشعارات غير المقروءة',
    notif_close: 'إغلاق الإشعارات',
    notif_open_notifications: 'فتح الإشعارات',
    notif_marked_read: 'تم تحديد الإشعار كمقروء',
    notif_all_read: 'تم تحديد كل الإشعارات كمقروءة',
    notif_just_now: 'الآن',
    reviews_title: 'التقييمات والآراء',
    write_review: 'اكتب تقييماً',
    your_rating: 'تقييمك',
    your_comment_placeholder: 'شاركنا رأيك في هذا المنتج (اختياري)...',
    submit_review: 'إرسال التقييم',
    review_saved: 'شكراً على تقييمك!',
    review_deleted: 'تم حذف التقييم.',
    sign_in_to_review: 'سجّل الدخول لإضافة تقييم وتعليق.',
    no_reviews_yet: 'لا توجد تقييمات بعد — كن أول من يقيّم!',
    reviews_loading: 'جارٍ تحميل التقييمات…',
    rating_required: 'الرجاء اختيار تقييم.',
    reviews_count_suffix: 'تقييمات',
    review_count_suffix_one: 'تقييم',
    delete_review: 'حذف',
    confirm_delete_review: 'حذف هذا التقييم؟',
    clear_rating: 'مسح',
    /* Account page */
    order_history: 'سجل الطلبات',
    orders_label: 'طلبات',
    total_spent_label: 'إجمالي الإنفاق',
    back_to_store: 'العودة للمتجر',
    shop_now: 'تسوق الآن',
    no_orders: 'لا توجد طلبات بعد.',
    no_orders_sub: 'ابدأ التسوق وستظهر طلباتك هنا!',
    member_label: 'عضو',
    admin_label: 'مدير',
    status_pending: 'قيد الانتظار',
    status_processing: 'قيد المعالجة',
    status_shipped: 'تم الشحن',
    status_delivered: 'تم التسليم',
    status_cancelled: 'ملغي',
    order_status_title: 'تحديث الطلب',
    order_msg_pending: 'تم استلام طلبك {id}.',
    order_msg_processing: 'يجري تجهيز طلبك {id}.',
    order_msg_shipped: 'طلبك {id} في الطريق.',
    order_msg_delivered: 'تم تسليم طلبك {id}.',
    order_msg_cancelled: 'تم إلغاء طلبك {id}.',
    track_order: 'تتبع الطلب',
    track_title: 'تتبع الطلب',
    track_close: 'إغلاق',
    track_current: 'الحالة الحالية',
    track_deliver_to: 'التوصيل إلى',
    track_items: 'منتجات',
    track_total: 'الإجمالي',
    track_shipping: 'الشحن',
    track_no_timeline: 'لا يوجد سجل للتتبع بعد.',
    track_failed: 'تعذّر تحميل تتبع الطلب.',
    order_items_label: 'منتجات',
    order_size_label: 'المقاس',
    order_total_label: 'الإجمالي',
    /* Guest browsing prompt */
    guest_welcome: 'أهلاً بك في شاكس ستور',
    guest_tagline: 'أنشئ حساباً لتسجيل خروج أسرع وتتبع طلباتك وتجربة تسوق شخصية. يمكنك أيضاً مواصلة التصفح كضيف.',
    guest_signin: 'تسجيل الدخول',
    guest_create: 'إنشاء حساب',
    guest_continue: 'متابعة كضيف',
  }
};

/* ─── APP STATE ───────────────────────────────────────── */
const STATE = {
  lang: localStorage.getItem('shax_lang') || 'ku',
  cart: JSON.parse(localStorage.getItem('shax_cart') || '[]'),
  token: localStorage.getItem('shax_token') || null,
  user: JSON.parse(localStorage.getItem('shax_user') || 'null'),
  categories: [],
  products: [],
  activeCategory: 'all',
  filters: [],
  activeFilters: [],
  sortMode: 'popular',
  modalProduct: null,
  selectedSize: null,
  selectedColor: null,
  minOrder: 0,
  selectedQty: 1,
  reviewRating: null
};

/* ─── i18n HELPERS ────────────────────────────────────── */
const t = key => (TRANSLATIONS[STATE.lang] || TRANSLATIONS.en)[key] || key;

/* Format a price in Iraqi Dinar.
   IQD has no minor units, so we drop decimals and add thousands separators,
   with the currency label after the number (e.g. "25,000 IQD"). */
function formatPrice(amount) {
  const n = Math.round(parseFloat(amount) || 0);
  const grouped = n.toLocaleString('en-US');
  return `${grouped} ${t('currency')}`;
}

function localizedField(obj, base) {
  if (!obj) return '';
  if (STATE.lang === 'ku' && obj[base + '_ku']) return obj[base + '_ku'];
  if (STATE.lang === 'ar' && obj[base + '_ar']) return obj[base + '_ar'];
  return obj[base] || '';
}
const getProductName = p => localizedField(p, 'name');
const getProductDesc = p => localizedField(p, 'description');
const getCategoryName = c => localizedField(c, 'name');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Escape a value for use INSIDE a single-quoted JS string literal that sits
   in an HTML attribute (e.g. onclick="fn('...')"). HTML escaping alone is
   not enough: the parser decodes &#39; back into a quote before JS runs. */
function jsStr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/<\//g, '<\\/');
}

function applyLanguage(lang) {
  STATE.lang = lang;
  localStorage.setItem('shax_lang', lang);
  const T = TRANSLATIONS[lang] || TRANSLATIONS.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = T.dir;
  document.body.classList.toggle('rtl', T.dir === 'rtl');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[key]) el.textContent = T[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (T[key]) el.placeholder = T[key];
  });

  syncLangButtons(lang);
  renderProducts();
  setupCategories();
  setupFilters();
  renderCart();
  updateCartCount();
  reapplyNotifPanelLanguage();
}

function syncLangButtons(lang) {
  document.querySelectorAll('.lang-dropdown').forEach(dd => {
    const flagImg  = dd.querySelector('.lang-btn-flag');
    const codeEl   = dd.querySelector('.lang-btn-code');
    if (flagImg) flagImg.src = `assets/flags/${lang}.png`;
    if (codeEl)  codeEl.textContent = lang.toUpperCase();
    dd.querySelectorAll('.lang-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.lang === lang);
    });
  });
}

/* ─── API HELPER ──────────────────────────────────────── */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(t('network_error'));
  }

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401 && STATE.token) {
    /* token invalid/expired — clear session silently */
    clearSession();
  }

  if (!res.ok) {
    throw new Error((data && data.error) || t('network_error'));
  }
  return data;
}

function clearSession() {
  STATE.token = null;
  STATE.user = null;
  localStorage.removeItem('shax_token');
  localStorage.removeItem('shax_user');
  updateAuthUI();
}

/* ─── TOAST ───────────────────────────────────────────── */
function showToast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ─── CATEGORIES ──────────────────────────────────────── */
async function loadCategories() {
  try {
    STATE.categories = await api('/categories');
    if (!Array.isArray(STATE.categories)) STATE.categories = [];
  } catch {
    STATE.categories = [];
  }
}

function categoryImage(cat) {
  return (cat && cat.image_url) || PLACEHOLDER_CATEGORY;
}

function categoryLabelById(id) {
  if (id === 'all') return t('cat_all');
  const cat = STATE.categories.find(c => c.id === id);
  return cat ? getCategoryName(cat) : id;
}

function setupCategories() {
  const slider = document.getElementById('cat-slider');
  if (!slider) return;

  const cats = [{ id: 'all', name: t('cat_all'), image_url: ALL_CATEGORY_ICON }, ...(Array.isArray(STATE.categories) ? STATE.categories : [])];

  slider.innerHTML = cats.map(c => {
    const count = c.id === 'all'
      ? STATE.products.length
      : STATE.products.filter(p => p.category === c.id).length;
    const label = c.id === 'all' ? t('cat_all') : getCategoryName(c);
    return `
      <div class="cat-item ${STATE.activeCategory === c.id ? 'active' : ''}" onclick="filterByCategory('${jsStr(String(c.id))}')">
        <div class="cat-icon">
          <img src="${escapeHtml(categoryImage(c))}" alt="${escapeHtml(label)}"
               onerror="this.onerror=null;this.src='${PLACEHOLDER_CATEGORY}'">
        </div>
        <div class="cat-name">${escapeHtml(label)}</div>
        <div class="cat-count">${count}</div>
      </div>
    `;
  }).join('');
}

function filterByCategory(id) {
  STATE.activeCategory = id;
  setupCategories();
  renderProducts();
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
}

/* ─── FILTERS (admin-made tags; customer can pick many) ─── */
async function loadFilters() {
  try { STATE.filters = await api('/filters'); }
  catch { STATE.filters = []; }
  if (!Array.isArray(STATE.filters)) STATE.filters = [];
}

function setupFilters() {
  const box = document.getElementById('filter-chips');
  if (!box) return;

  // "All" chip + each admin filter. No filters → just show All.
  const chips = [{ id: 'all', name: t('filter_all') }, ...STATE.filters];
  box.innerHTML = chips.map(f => {
    const label = f.id === 'all' ? t('filter_all') : getFilterName(f);
    const active = f.id === 'all'
      ? STATE.activeFilters.length === 0
      : STATE.activeFilters.includes(f.id);
    return `<button class="filter-btn ${active ? 'active' : ''}" onclick="toggleFilter('${jsStr(String(f.id))}')">${escapeHtml(label)}</button>`;
  }).join('');
}

function toggleFilter(id) {
  if (id === 'all') {
    STATE.activeFilters = [];
  } else {
    const i = STATE.activeFilters.indexOf(id);
    if (i >= 0) STATE.activeFilters.splice(i, 1);
    else STATE.activeFilters.push(id);
  }
  setupFilters();
  renderProducts();
}

function applySort(mode) {
  STATE.sortMode = mode;
  renderProducts();
}

function getFilterName(f) {
  if (!f) return '';
  if (STATE.lang === 'ku' && f.name_ku) return f.name_ku;
  if (STATE.lang === 'ar' && f.name_ar) return f.name_ar;
  return f.name;
}

/* ─── PRODUCTS ────────────────────────────────────────── */
async function loadProducts() {
  try {
    // Popular order (most sold, then best-rated) so the "All" view leads with
    // the best products. Category/type filters run client-side on this list.
    STATE.products = await api('/products?sort=popular');
    if (!Array.isArray(STATE.products)) STATE.products = [];
  } catch {
    STATE.products = [];
    showToast(t('network_error'), 'error');
  }
  pruneCart();
}

function productImage(p) {
  return (p && p.image) || PLACEHOLDER_PRODUCT;
}

function hoverProductColor(productId, colorIndex) {
  const product = STATE.products.find(p => p.id === productId);
  if (!product || !product.colors || !product.colors[colorIndex]) return;
  const card = document.querySelector(`.product-card[data-pid="${productId}"]`);
  if (!card) return;
  const img = card.querySelector('.product-img-wrap img');
  const color = product.colors[colorIndex];
  if (img && color.image) img.src = color.image;
  card.querySelectorAll('.product-color-dot').forEach((d, i) => {
    d.classList.toggle('active', i === colorIndex);
  });
}

function getBadgeLabel(badge) {
  if (!badge) return '';
  if (badge === 'new') return `<span class="product-badge new">${t('new_label')}</span>`;
  if (badge === 'bestseller') return `<span class="product-badge">${t('bestseller')}</span>`;
  return `<span class="product-badge">${escapeHtml(badge)}</span>`;
}

function starsHTML(rating, sizeClass = '') {
  const r = Math.round(Number(rating) || 0);
  let html = `<span class="stars ${sizeClass}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fas fa-star${i <= r ? ' filled' : ''}"></i>`;
  }
  html += '</span>';
  return html;
}

function ratingRowHTML(p, rowClass) {
  const count = p.reviewCount || 0;
  const countLabel = count === 1 ? t('review_count_suffix_one') : t('reviews_count_suffix');
  return `
    <div class="${rowClass}">
      ${starsHTML(p.avgRating)}
      <span class="rating-count">${count > 0 ? `${p.avgRating.toFixed(1)} · ${count} ${countLabel}` : t('no_reviews_yet')}</span>
    </div>
  `;
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  let filtered = (Array.isArray(STATE.products) ? STATE.products : []).slice();
  if (STATE.activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category === STATE.activeCategory);
  }
  // Admin filter tags: product must have at least one of the selected tags.
  if (STATE.activeFilters.length) {
    filtered = filtered.filter(p =>
      (p.filters || []).some(f => STATE.activeFilters.includes(f.id))
    );
  }

  const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  if (searchVal) {
    filtered = filtered.filter(p =>
      (p.name && p.name.toLowerCase().includes(searchVal)) ||
      (p.name_ku && p.name_ku.toLowerCase().includes(searchVal)) ||
      (p.name_ar && p.name_ar.toLowerCase().includes(searchVal)) ||
      (p.category && p.category.toLowerCase().includes(searchVal))
    );
  }

  // Sorting (client-side so it's instant). In-stock always ranks first.
  const mode = STATE.sortMode || 'popular';
  filtered.sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (mode === 'price_asc')  return a.price - b.price;
    if (mode === 'price_desc') return b.price - a.price;
    if (mode === 'new')        return (b.id || 0) - (a.id || 0);
    // popular: sold count, then rating, then reviews
    return (b.soldCount || 0) - (a.soldCount || 0)
        || (b.avgRating || 0) - (a.avgRating || 0)
        || (b.reviewCount || 0) - (a.reviewCount || 0);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="no-results"><i class="fas fa-search"></i>${escapeHtml(t('no_results'))}</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const colors = Array.isArray(p.colors) ? p.colors : [];
    const hasMultiColors = colors.length > 1;
    const allImages = hasMultiColors
      ? [productImage(p), ...colors.filter(c => c.image && c.image !== productImage(p)).map(c => c.image)]
      : [productImage(p)];
    const uniqueImages = [...new Set(allImages)];

    const colorSwatches = hasMultiColors ? `
      <div class="product-colors" onclick="event.stopPropagation()">
        ${colors.map((c, ci) => `
          <button class="product-color-dot${ci === 0 ? ' active' : ''}"
                  style="background:${escapeHtml(c.hex)}"
                  onmouseenter="manualSelectColor(${p.id}, ${ci})"
                  onclick="event.stopPropagation(); manualSelectColor(${p.id}, ${ci})"
                  title="${escapeHtml(c.name)}"></button>
        `).join('')}
      </div>
    ` : '';

    const sliderImages = uniqueImages.length > 1 ? uniqueImages : null;

    return `
    <div class="product-card reveal" onclick="openProductModal(${p.id})" data-pid="${p.id}">
      <div class="product-img-wrap">
        ${sliderImages ? `
          <div class="product-img-slider" data-pid="${p.id}" data-total="${sliderImages.length}">
            ${sliderImages.map((img, i) => `
              <img class="product-slide${i === 0 ? ' active' : ''}" src="${escapeHtml(img)}"
                   alt="${escapeHtml(getProductName(p))}" loading="lazy"
                   onerror="this.onerror=null;this.src='${PLACEHOLDER_PRODUCT}'">
            `).join('')}
            <div class="slider-progress" data-pid="${p.id}"><div class="slider-progress-fill"></div></div>
          </div>
        ` : `
          <img src="${escapeHtml(productImage(p))}" alt="${escapeHtml(getProductName(p))}"
               loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_PRODUCT}'">
        `}
        ${!p.inStock ? `<span class="product-badge out">${t('out_of_stock')}</span>` : getBadgeLabel(p.badge)}
        ${p.inStock ? `
          <div class="product-quick-add">
            <button class="btn btn-gold btn-sm" style="width:100%"
              onclick="event.stopPropagation(); quickAddToCart(${p.id})">
              <i class="fas fa-cart-plus"></i> ${t('add_to_cart')}
            </button>
          </div>
        ` : ''}
      </div>
      ${colorSwatches}
      <div class="product-info">
        <div class="product-category">${escapeHtml(categoryLabelById(p.category)).toUpperCase()}</div>
        <div class="product-name">${escapeHtml(getProductName(p))}</div>
        ${ratingRowHTML(p, 'product-rating-row')}
        <div class="product-footer">
          <div class="product-price">
            ${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ''}
            ${formatPrice(p.price)}
          </div>
          ${p.inStock ? `
            <button class="add-to-cart-btn"
              onclick="event.stopPropagation(); quickAddToCart(${p.id})"
              title="${escapeHtml(t('add_to_cart'))}">
              <i class="fas fa-plus"></i>
            </button>
          ` : ''}
        </div>
      </div>
    </div>
    `;
  }).join('');

  /* Animate the freshly-rendered cards into view (staggered via CSS nth-child) */
  revealProductCards();
}

/* Reveal dynamically-rendered product cards. On first paint they fade up via an
   observer; on re-filter/search they're already in view so we just show them. */
function revealProductCards() {
  const cards = document.querySelectorAll('#products-grid .product-card.reveal');
  if (!cards.length) return;

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    cards.forEach(c => io.observe(c));
    /* Fallback: if still not visible shortly after (e.g. already on-screen
       above the fold), force them visible so nothing stays hidden. */
    setTimeout(() => cards.forEach(c => c.classList.add('visible')), 400);
  } else {
    cards.forEach(c => c.classList.add('visible'));
  }

  initAllSliders();
}

/* ─── PRODUCT COLOR AUTO-SLIDER ──────────────────────── */
const SLIDER_INTERVAL = 5000;
const sliderTimers = {};

function initAllSliders() {
  Object.keys(sliderTimers).forEach(k => { clearInterval(sliderTimers[k]); delete sliderTimers[k]; });

  document.querySelectorAll('.product-img-slider').forEach(slider => {
    const pid = slider.dataset.pid;
    const total = parseInt(slider.dataset.total, 10);
    if (total <= 1) return;

    let current = 0;
    const slides = slider.querySelectorAll('.product-slide');
    const fill = slider.querySelector('.slider-progress-fill');

    function goToSlide(index) {
      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      current = index;
      if (fill) {
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.transition = `width ${SLIDER_INTERVAL}ms linear`;
        fill.style.width = '100%';
      }
    }

    goToSlide(0);

    sliderTimers[pid] = setInterval(() => {
      const next = (current + 1) % total;
      goToSlide(next);

      const colors = (STATE.products.find(p => p.id === Number(pid)) || {}).colors || [];
      if (colors.length > 1) {
        const dots = document.querySelectorAll(`.product-card[data-pid="${pid}"] .product-color-dot`);
        dots.forEach((d, i) => d.classList.toggle('active', i === next));
      }
    }, SLIDER_INTERVAL);
  });
}

function manualSelectColor(productId, colorIndex) {
  const product = STATE.products.find(p => p.id === productId);
  if (!product || !product.colors || !product.colors[colorIndex]) return;

  const card = document.querySelector(`.product-card[data-pid="${productId}"]`);
  if (!card) return;

  const slider = card.querySelector('.product-img-slider');
  if (!slider) return;

  const slides = slider.querySelectorAll('.product-slide');
  const fill = slider.querySelector('.slider-progress-fill');
  const color = product.colors[colorIndex];
  const targetImage = color.image || productImage(product);

  let targetIndex = 0;
  slides.forEach((s, i) => {
    if (s.src.includes(targetImage) || targetImage.includes(s.src.split('/').pop())) {
      targetIndex = i;
    }
  });

  slides.forEach((s, i) => s.classList.toggle('active', i === targetIndex));
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth;
    fill.style.transition = `width ${SLIDER_INTERVAL}ms linear`;
    fill.style.width = '100%';
  }

  card.querySelectorAll('.product-color-dot').forEach((d, i) => {
    d.classList.toggle('active', i === colorIndex);
  });

  if (sliderTimers[productId]) {
    clearInterval(sliderTimers[productId]);
  }

  let current = targetIndex;
  const total = slides.length;
  sliderTimers[productId] = setInterval(() => {
    current = (current + 1) % total;
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '0%';
      void fill.offsetWidth;
      fill.style.transition = `width ${SLIDER_INTERVAL}ms linear`;
      fill.style.width = '100%';
    }
    const cols = (STATE.products.find(p => p.id === productId) || {}).colors || [];
    if (cols.length > 1) {
      const dots = card.querySelectorAll('.product-color-dot');
      const mappedIndex = current < cols.length ? current : current % cols.length;
      dots.forEach((d, i) => d.classList.toggle('active', i === mappedIndex));
    }
  }, SLIDER_INTERVAL);
}

function quickAddToCart(productId) {
  const product = STATE.products.find(p => p.id === productId);
  if (!product) return;
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  if (sizes[0] === 'ONE SIZE') {
    addToCart(productId, 'ONE SIZE', 1);
  } else {
    openProductModal(productId);
  }
}

/* ─── CART ────────────────────────────────────────────── */
function saveCart() {
  localStorage.setItem('shax_cart', JSON.stringify(STATE.cart));
}

function pruneCart() {
  const before = STATE.cart.length;
  STATE.cart = STATE.cart.filter(i => STATE.products.some(p => p.id === i.productId));
  if (STATE.cart.length !== before) saveCart();
}

function getCartProduct(item) {
  return STATE.products.find(p => p.id === item.productId);
}

function addToCart(productId, size, qty = 1, color = '') {
  if (!STATE.user) {
    openAuth();
    showToast(t('sign_in_required'), 'error');
    return;
  }
  const product = STATE.products.find(p => p.id === productId);
  if (!product) return;
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  if (!size && sizes[0] !== 'ONE SIZE') {
    showToast(t('select_size'), 'error');
    return;
  }
  // Colors, if the product has them, are required.
  if (product.colors && product.colors.length && !color) {
    showToast(t('select_color'), 'error');
    return;
  }

  // Key includes color so different colors are separate cart lines.
  const key = `${productId}-${size || 'OS'}-${color || 'NC'}`;
  const existing = STATE.cart.find(i => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    STATE.cart.push({ key, productId, size: size || 'ONE SIZE', color: color || '', qty });
  }
  saveCart();
  updateCartCount();
  renderCart();
  openCart();
  showToast(`${getProductName(product)} ${t('add_to_cart')} ✓`);
}

function removeFromCart(key) {
  STATE.cart = STATE.cart.filter(i => i.key !== key);
  saveCart();
  updateCartCount();
  renderCart();
}

function updateCartQty(key, delta) {
  const item = STATE.cart.find(i => i.key === key);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart();
  renderCart();
}

function getCartTotal() {
  return STATE.cart.reduce((s, i) => {
    const p = getCartProduct(i);
    return s + (p ? p.price * i.qty : 0);
  }, 0);
}

/* Per-product shipping: each distinct product's shipping is charged once,
   regardless of quantity. Products with shipping 0 are free. */
function getCartShipping() {
  let maxShipping = 0;

  for (const i of STATE.cart) {
    const p = getCartProduct(i);
    if (!p) continue;

    maxShipping = Math.max(maxShipping, parseFloat(p.shipping) || 0);
  }

  return maxShipping;
}

function updateCartCount() {
  const total = STATE.cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  const prev = parseInt(badge.textContent, 10) || 0;
  badge.textContent = total;
  badge.classList.toggle('show', total > 0);
  /* Little pop when the count actually changes */
  if (total !== prev && total > 0) {
    badge.classList.remove('bump');
    void badge.offsetWidth; /* reflow so the animation can restart */
    badge.classList.add('bump');
  }
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const emptyEl   = document.getElementById('cart-empty');
  const footerEl  = document.getElementById('cart-footer');
  if (!container) return;

  if (STATE.cart.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (footerEl) footerEl.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (footerEl) footerEl.style.display = 'block';

  container.innerHTML = STATE.cart.map(item => {
    const p = getCartProduct(item);
    if (!p) return '';
    return `
    <div class="cart-item">
      <img class="cart-item-img" src="${escapeHtml(productImage(p))}" alt="${escapeHtml(getProductName(p))}"
           onerror="this.onerror=null;this.src='${PLACEHOLDER_PRODUCT}'">
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(getProductName(p))}</div>
        <div class="cart-item-variant">${escapeHtml(item.size)}${item.color ? ` · ${(() => {
          const c = (p.colors || []).find(cc => cc.name === item.color);
          return `<span style="display:inline-flex;align-items:center;gap:4px">${c ? `<span style="width:11px;height:11px;border-radius:3px;border:1px solid #888;background:${escapeHtml(c.hex)};display:inline-block"></span>` : ''}${escapeHtml(item.color)}</span>`;
        })()}` : ''} · ${formatPrice(p.price)}</div>
        <div class="cart-item-price">${formatPrice(p.price * item.qty)}</div>
      </div>
      <div class="cart-item-controls">
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="updateCartQty('${jsStr(item.key)}', -1)"><i class="fas fa-minus"></i></button>
          <span class="qty-num">${item.qty}</span>
          <button class="qty-btn" onclick="updateCartQty('${jsStr(item.key)}', 1)"><i class="fas fa-plus"></i></button>
        </div>
        <button class="cart-remove" onclick="removeFromCart('${jsStr(item.key)}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `;
  }).join('');

  const subtotal = getCartTotal();
  const shipping = getCartShipping();
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl    = document.getElementById('cart-total');
  const shippingEl = document.getElementById('cart-shipping-value');
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (shippingEl) shippingEl.textContent = shipping > 0 ? formatPrice(shipping) : t('cart_free_shipping');
  if (totalEl)    totalEl.textContent    = formatPrice(subtotal + shipping);

  // Hide footer in native apps
  const isNativeApp = (function () {
    try {
      return window.Capacitor && 
             typeof window.Capacitor.isNativePlatform === 'function' && 
             window.Capacitor.isNativePlatform();
    } catch (e) { 
      return false; 
    }
  })();
  
  if (isNativeApp) {
    // Hide footer in native apps
    const footer = document.getElementById('footer');
    if (footer) {
      footer.style.display = 'none';
    }
  }

  // Minimum-order notice: warn and block checkout if the cart is below it.
  const notice = document.getElementById('cart-min-order-notice');
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  if (notice && checkoutBtn) {
    if (STATE.minOrder > 0 && subtotal < STATE.minOrder && subtotal > 0) {
      const remaining = STATE.minOrder - subtotal;
      notice.style.display = 'block';
      notice.innerHTML = `${t('min_order_msg')} <b>${formatPrice(STATE.minOrder)}</b> — ${t('add')} ${formatPrice(remaining)} ${t('more_to_order') || ''}`;
      checkoutBtn.disabled = true;
      checkoutBtn.style.opacity = '0.5';
      checkoutBtn.style.cursor = 'not-allowed';
    } else {
      notice.style.display = 'none';
      checkoutBtn.disabled = false;
      checkoutBtn.style.opacity = '';
      checkoutBtn.style.cursor = '';
    }
  }
}

function openCart() {
  document.getElementById('cart-sidebar')?.classList.add('open');
  document.getElementById('cart-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cart-sidebar')?.classList.remove('open');
  document.getElementById('cart-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ─── PRODUCT MODAL ────────────────────────────────────── */
function openProductModal(productId) {
  const product = STATE.products.find(p => p.id === productId);
  if (!product) return;
  STATE.modalProduct = product;
  STATE.selectedSize = null;
  STATE.selectedColor = null;
  STATE.selectedQty = 1;
  STATE.reviewRating = null;

  const overlay = document.getElementById('product-modal-overlay');
  const modal   = document.getElementById('product-modal');
  if (!overlay || !modal) return;

  modal.innerHTML = `
    <img class="modal-img" id="modal-main-img" src="${escapeHtml(productImage(product))}" alt="${escapeHtml(getProductName(product))}"
         onerror="this.onerror=null;this.src='${PLACEHOLDER_PRODUCT}'">
    ${(product.colors && product.colors.length > 1) ? `
      <div class="modal-color-gallery" id="modal-color-gallery">
        ${product.colors.map((c, i) => `
          <button class="modal-gallery-thumb${i === 0 ? ' active' : ''}" onclick="selectColor(${i})" title="${escapeHtml(c.name)}">
            <img src="${escapeHtml(c.image || productImage(product))}" alt="${escapeHtml(c.name)}">
          </button>
        `).join('')}
      </div>
    ` : ''}
    <div class="modal-details">
      <button class="modal-close" onclick="closeProductModal()"><i class="fas fa-times"></i></button>
      <div class="modal-cat">${escapeHtml(categoryLabelById(product.category)).toUpperCase()}</div>
      <div class="modal-name">${escapeHtml(getProductName(product))}</div>
      <div class="modal-rating-row" id="modal-rating-row">
        ${starsHTML(product.avgRating, 'lg')}
        <span class="rating-count">${product.reviewCount > 0 ? `${product.avgRating.toFixed(1)} (${product.reviewCount})` : t('no_reviews_yet')}</span>
      </div>
      <div class="modal-price">
        ${product.oldPrice ? `<span style="font-size:1rem;color:#555;text-decoration:line-through;margin-right:8px">${formatPrice(product.oldPrice)}</span>` : ''}
        ${formatPrice(product.price)}
      </div>
      <div style="font-size:0.85rem;margin:6px 0 2px;color:${(parseFloat(product.shipping)||0) > 0 ? 'var(--white-dim)' : '#27ae60'}">
        <i class="fas fa-truck" style="margin-right:6px"></i>${(parseFloat(product.shipping)||0) > 0
          ? `${t('shipping_label')}: ${formatPrice(product.shipping)}`
          : t('free_shipping_label')}
      </div>
      ${(product.inStock && product.stockMode === 'count' && product.sizeStock) ? `
        <div style="font-size:0.85rem;margin:4px 0;display:flex;flex-wrap:wrap;gap:4px 12px">
          ${Object.entries(product.sizeStock).map(([sz, q]) =>
            `<span style="color:${q > 0 ? '#27ae60' : '#c0392b'}">
               <i class="fas fa-box" style="margin-right:4px"></i>${escapeHtml(sz)}: ${q > 0 ? `${q} ${t('in_stock_count')}` : t('out_of_stock')}
             </span>`).join('')}
        </div>` : ''}
      <div class="modal-desc">${escapeHtml(getProductDesc(product))}</div>
      <div class="modal-sizes">
        <div class="modal-size-label">${t('size_label')}</div>
        <div class="size-opts" id="modal-sizes">
          ${product.sizes.map(s => {
            // In per-size count mode, disable sizes that are sold out.
            const perSize = (product.stockMode === 'count' && product.sizeStock) ? product.sizeStock : null;
            const soldOut = perSize ? !((Number(perSize[s]) || 0) > 0) : false;
            return `<button class="size-btn${soldOut ? ' size-sold-out' : ''}"
              ${soldOut ? 'disabled' : `onclick="selectSize('${jsStr(s)}')"`}
              title="${soldOut ? escapeHtml(t('out_of_stock')) : ''}">${escapeHtml(s)}</button>`;
          }).join('')}
        </div>
      </div>
      ${(product.colors && product.colors.length) ? `
      <div class="modal-colors">
        <div class="modal-size-label">${t('color_label')}: <span id="selected-color-name" style="color:var(--gold)"></span></div>
        <div class="color-opts" id="modal-colors">
          ${product.colors.map((c, i) => `
            <button class="color-swatch" onclick="selectColor(${i})" title="${escapeHtml(c.name)}"
                    style="background:${escapeHtml(c.hex)}"><span class="color-check"><i class="fas fa-check"></i></span></button>
          `).join('')}
        </div>
      </div>` : ''}
      <div class="modal-qty">
        <span class="modal-qty-label">${t('qty_label')}</span>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="changeModalQty(-1)"><i class="fas fa-minus"></i></button>
          <span class="qty-num" id="modal-qty-num">1</span>
          <button class="qty-btn" onclick="changeModalQty(1)"><i class="fas fa-plus"></i></button>
        </div>
      </div>
      <div class="modal-actions">
        ${product.inStock ? `
          <button class="btn btn-gold" onclick="addModalToCart()">
            <i class="fas fa-cart-plus"></i> ${t('add_to_cart')}
          </button>
          <button class="btn btn-outline" onclick="buyNow()">
            ${t('buy_now')}
          </button>
        ` : `<span class="badge badge-danger" style="padding:12px 20px;">${t('out_of_stock')}</span>`}
      </div>
    </div>
    <div class="modal-reviews" id="modal-reviews">
      <div class="reviews-heading">${t('reviews_title')}</div>
      <div class="reviews-loading">${t('reviews_loading')}</div>
    </div>
  `;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  loadAndRenderReviews(productId);
}

function closeProductModal() {
  document.getElementById('product-modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function selectSize(size) {
  STATE.selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => {
    b.classList.toggle('selected', b.textContent === size);
  });
}

function selectColor(index) {
  const product = STATE.modalProduct;
  if (!product || !product.colors || !product.colors[index]) return;
  const color = product.colors[index];
  STATE.selectedColor = color;

  // Highlight the chosen swatch.
  document.querySelectorAll('.color-swatch').forEach((b, i) => {
    b.classList.toggle('selected', i === index);
  });
  // Show the chosen color's name.
  const nameEl = document.getElementById('selected-color-name');
  if (nameEl) nameEl.textContent = color.name;

  // Swap the main image to this color's image (fall back to main image).
  const img = document.getElementById('modal-main-img');
  if (img) img.src = color.image || productImage(product) || PLACEHOLDER_PRODUCT;

  // Highlight the gallery thumb.
  document.querySelectorAll('.modal-gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
}

function changeModalQty(delta) {
  STATE.selectedQty = Math.max(1, STATE.selectedQty + delta);
  const el = document.getElementById('modal-qty-num');
  if (el) el.textContent = STATE.selectedQty;
}

function addModalToCart() {
  if (!STATE.modalProduct) return;
  const product = STATE.modalProduct;
  const size = STATE.selectedSize || (product.sizes[0] === 'ONE SIZE' ? 'ONE SIZE' : null);
  if (!size && product.sizes[0] !== 'ONE SIZE') {
    showToast(t('select_size'), 'error');
    return;
  }
  // If the product has colors, one must be chosen (like size).
  if (product.colors && product.colors.length && !STATE.selectedColor) {
    showToast(t('select_color'), 'error');
    return;
  }
  const colorName = STATE.selectedColor ? STATE.selectedColor.name : '';
  addToCart(product.id, size, STATE.selectedQty, colorName);
  closeProductModal();
}

function buyNow() {
  addModalToCart();
  closeCart();
  openCheckout();
}

/* ─── REVIEWS ─────────────────────────────────────────── */
async function loadAndRenderReviews(productId) {
  const container = document.getElementById('modal-reviews');
  if (!container) return;

  let data;
  try {
    data = await api(`/reviews/${productId}`);
  } catch {
    container.innerHTML = `<div class="reviews-heading">${t('reviews_title')}</div><div class="no-reviews">${t('network_error')}</div>`;
    return;
  }

  /* Keep the header rating row in sync with fresh data */
  const headerRow = document.getElementById('modal-rating-row');
  if (headerRow) {
    const countLabel = data.count === 1 ? t('review_count_suffix_one') : t('reviews_count_suffix');
    headerRow.innerHTML = `
      ${starsHTML(data.average, 'lg')}
      <span class="rating-count">${data.count > 0 ? `${data.average.toFixed(1)} (${data.count} ${countLabel})` : t('no_reviews_yet')}</span>
    `;
  }

  const formHTML = STATE.user ? `
    <div class="review-form">
      <div class="review-form-label">${t('your_rating')}</div>
      <div class="star-input" id="review-star-input">
        ${[1,2,3,4,5].map(v => `<i class="fas fa-star" data-val="${v}" onclick="setReviewRating(${v})"></i>`).join('')}
        <button type="button" class="link-btn" style="font-size:.72rem;color:var(--white-dim);margin-left:8px;background:none;border:none;cursor:pointer"
                onclick="setReviewRating(0)">${t('clear_rating')}</button>
      </div>
      <textarea id="review-comment" maxlength="1000" placeholder="${escapeHtml(t('your_comment_placeholder'))}"></textarea>
      <button class="btn btn-gold btn-sm" onclick="submitReview(${productId})">
        <i class="fas fa-paper-plane"></i> ${t('submit_review')}
      </button>
    </div>
  ` : `
    <div class="review-signin-note">
      <i class="fas fa-lock" style="color:var(--gold);margin-right:6px"></i>
      ${t('sign_in_to_review')}
      <span class="link-btn" onclick="closeProductModal();openAuth()">${t('login')}</span>
    </div>
  `;

  const listHTML = data.reviews.length === 0
    ? `<div class="no-reviews">${t('no_reviews_yet')}</div>`
    : `<div class="review-list">${data.reviews.map(r => reviewItemHTML(r)).join('')}</div>`;

  container.innerHTML = `
    <div class="reviews-heading">${t('reviews_title')}</div>
    ${formHTML}
    ${listHTML}
  `;
}

function reviewItemHTML(r) {
  const canDelete = STATE.user && (STATE.user.id === r.userId || STATE.user.isAdmin);
  const date = r.date ? new Date(r.date).toLocaleDateString() : '';
  return `
    <div class="review-item">
      <div class="review-item-top">
        <span class="review-author">${escapeHtml(r.userName)}</span>
        ${starsHTML(r.rating)}
        <span class="review-date">${date}</span>
        ${canDelete ? `<button class="link-btn" style="background:none;border:none;color:#C0392B;font-size:.72rem;cursor:pointer"
            onclick="deleteReview(${r.id}, ${STATE.modalProduct ? STATE.modalProduct.id : 'null'})">${t('delete_review')}</button>` : ''}
      </div>
      ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
    </div>
  `;
}

function setReviewRating(val) {
  STATE.reviewRating = val;
  document.querySelectorAll('#review-star-input i').forEach(star => {
    star.classList.toggle('filled', Number(star.dataset.val) <= val);
  });
}

async function submitReview(productId) {
  if (STATE.reviewRating === null) {
    showToast(t('rating_required'), 'error');
    return;
  }
  const comment = document.getElementById('review-comment')?.value.trim() || '';
  try {
    await api(`/reviews/${productId}`, {
      method: 'POST',
      body: JSON.stringify({ rating: STATE.reviewRating, comment })
    });
    showToast(t('review_saved'));
    /* Refresh the product's aggregate rating in the local cache too */
    await loadAndRenderReviews(productId);
    refreshProductRatingLocally(productId);
  } catch (err) {
    showToast(err.message || t('network_error'), 'error');
  }
}

async function deleteReview(reviewId, productId) {
  if (!confirm(t('confirm_delete_review'))) return;
  try {
    await api(`/reviews/${reviewId}`, { method: 'DELETE' });
    showToast(t('review_deleted'));
    if (productId) {
      await loadAndRenderReviews(productId);
      refreshProductRatingLocally(productId);
    }
  } catch (err) {
    showToast(err.message || t('network_error'), 'error');
  }
}

async function refreshProductRatingLocally(productId) {
  try {
    const data = await api(`/reviews/${productId}`);
    const p = STATE.products.find(x => x.id === productId);
    if (p) {
      p.avgRating = data.average;
      p.reviewCount = data.count;
    }
    renderProducts();
  } catch { /* non-critical */ }
}

/* ─── SEARCH ──────────────────────────────────────────── */
function setupSearch(inputId = 'search-input', resultsId = 'search-results') {
  const input   = document.getElementById(inputId);
  const results = document.getElementById(resultsId);
  if (!input) return;

  input.addEventListener('input', () => {
    const val = input.value.trim().toLowerCase();
    if (val.length < 2) { results?.classList.remove('open'); return; }

    const matches = STATE.products.filter(p =>
      (p.name && p.name.toLowerCase().includes(val)) ||
      (p.name_ku && p.name_ku.toLowerCase().includes(val)) ||
      (p.name_ar && p.name_ar.toLowerCase().includes(val))
    ).slice(0, 5);

    if (!results) return;
    if (matches.length === 0) { results.classList.remove('open'); return; }
    results.classList.add('open');
    results.innerHTML = matches.map(p => `
      <div class="search-item" onclick="goToProduct(${p.id})">
        <img src="${escapeHtml(productImage(p))}" alt="${escapeHtml(getProductName(p))}"
             onerror="this.onerror=null;this.src='${PLACEHOLDER_PRODUCT}'">
        <div class="search-item-info">
          <div class="search-item-name">${escapeHtml(getProductName(p))}</div>
          <div class="search-item-price">${formatPrice(p.price)}</div>
        </div>
      </div>
    `).join('');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      renderProducts();
      results?.classList.remove('open');
    }
  });

  document.addEventListener('click', e => {
    if (!input.closest('.nav-search')?.contains(e.target)) {
      results?.classList.remove('open');
    }
  });
}

function goToProduct(id) {
  document.querySelectorAll('#search-results, #search-results-mobile').forEach(r => r.classList.remove('open'));
  ['search-input', 'search-input-mobile'].forEach(i => {
    const el = document.getElementById(i);
    if (el) el.value = '';
  });
  closeMobileMenu();
  document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => openProductModal(id), 600);
}

/* ─── LANGUAGE DROPDOWN ───────────────────────────────── */
function toggleLangMenu(dropdownId) {
  const dd = document.getElementById(dropdownId);
  if (!dd) return;
  const wasOpen = dd.classList.contains('open');
  closeAllLangMenus();
  if (!wasOpen) dd.classList.add('open');
}
function closeAllLangMenus() {
  document.querySelectorAll('.lang-dropdown.open').forEach(dd => dd.classList.remove('open'));
}
function selectLanguage(lang) {
  applyLanguage(lang);
  closeAllLangMenus();
}
document.addEventListener('click', e => {
  if (!e.target.closest('.lang-dropdown')) closeAllLangMenus();
});

/* ─── AUTH ────────────────────────────────────────────── */
function openAuth() {
  document.getElementById('auth-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  const err1 = document.getElementById('login-error');
  const err2 = document.getElementById('signup-error');
  if (err1) err1.textContent = '';
  if (err2) err2.textContent = '';
}
function closeAuth() {
  document.getElementById('auth-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ─── GUEST BROWSING PROMPT (optional, for visitors) ───── */
/* A new/returning guest is offered a gentle Login/Register prompt
   after the storefront has loaded. It is fully optional: "Continue as
   Guest" (or the X / Escape / backdrop click) dismisses it and records
   that choice locally so it is not shown again on every page load for
   a while. Authenticated users are never prompted.                 */
const GUEST_DISMISS_KEY = 'shax_guest_dismissed';
const GUEST_REMIND_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function openGuestPrompt() {
  const overlay = document.getElementById('guest-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  const first = overlay.querySelector('.guest-actions .guest-btn');
  if (first) first.focus({ preventScroll: true });
}
function closeGuestPrompt() {
  const overlay = document.getElementById('guest-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}
function continueAsGuest() {
  try { localStorage.setItem(GUEST_DISMISS_KEY, String(Date.now())); } catch (e) {}
  closeGuestPrompt();
}
function shouldShowGuestPrompt() {
  if (STATE.user) return false; // authenticated users are never prompted
  try {
    const last = parseInt(localStorage.getItem(GUEST_DISMISS_KEY) || '0', 10);
    if (last && (Date.now() - last) < GUEST_REMIND_MS) return false;
  } catch (e) {}
  return true;
}
function maybeShowGuestPrompt() {
  if (!document.getElementById('guest-overlay')) return; // only storefront pages
  // Delay so the storefront is fully loaded/usable before offering it.
  setTimeout(() => { if (shouldShowGuestPrompt()) openGuestPrompt(); }, 1200);
}
/* Open the existing auth modal on a specific tab, reusing the real
   login / sign-up form, API and token handling. */
function openAuthTab(tab) {
  const tabEl = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
  const form = document.getElementById(tab);
  if (form) form.classList.add('active');
  openAuth();
}
function guestSignIn() { closeGuestPrompt(); openAuthTab('login-form'); }
function guestSignUp() { closeGuestPrompt(); openAuthTab('signup-form'); }

/* Dismiss the guest prompt with Escape or a backdrop click (same
   "Continue as Guest" behaviour — non-intrusive, never blocks browsing). */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('guest-overlay')?.classList.contains('open')) continueAsGuest();
});
document.addEventListener('click', e => {
  const overlay = document.getElementById('guest-overlay');
  if (overlay && e.target === overlay) continueAsGuest();
});

let AUTH_BUSY = false;

async function handleLogin(e) {
  e.preventDefault();
  if (AUTH_BUSY) return;
  const email = document.getElementById('login-email')?.value.trim();
  const pass  = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-error');
  if (errEl) errEl.textContent = '';

  AUTH_BUSY = true;
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass })
    });
    STATE.token = data.token;
    STATE.user  = data.user;
    localStorage.setItem('shax_token', STATE.token);
    localStorage.setItem('shax_user', JSON.stringify(STATE.user));
    closeAuth();
    updateAuthUI();
    showToast(`${t('welcome_back')}`);
    if (!STATE.user.isAdmin && STATE.user.role !== 'sponsor') window.requestShaxNotificationPermission?.();
    if (STATE.user.isAdmin) {
      window.location.href = 'admin/index.html';
    } else if (STATE.user.role === 'sponsor') {
      window.location.href = 'sponsor/index.html';
    }
  } catch (err) {
    if (errEl) errEl.textContent = err.message || t('invalid_credentials');
  } finally {
    AUTH_BUSY = false;
  }
}

async function handleSignup(e) {
  e.preventDefault();
  if (AUTH_BUSY) return;
  const name  = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const pass  = document.getElementById('signup-pass')?.value;
  const pass2 = document.getElementById('signup-pass2')?.value;
  const errEl = document.getElementById('signup-error');
  if (errEl) errEl.textContent = '';

  if (pass !== pass2) {
    if (errEl) errEl.textContent = t('passwords_no_match');
    return;
  }

  try {
    const data = await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password: pass })
    });
    STATE.token = data.token;
    STATE.user  = data.user;
    localStorage.setItem('shax_token', STATE.token);
    localStorage.setItem('shax_user', JSON.stringify(STATE.user));
    closeAuth();
    updateAuthUI();
    showToast(`${t('welcome_back')} ${STATE.user.name}! 🎉`);
    if (!STATE.user.isAdmin && STATE.user.role !== 'sponsor') window.requestShaxNotificationPermission?.();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || t('network_error');
  } finally {
    AUTH_BUSY = false;
  }
}

function logout() {
  clearSession();
  /* Native-only: unregister the device token (backend deactivates it so
     the account can no longer receive push) then clear our copy. */
  window.deactivateShaxPush?.();
  document.getElementById('user-dropdown')?.classList.remove('open');
  showToast(t('logout') + '.');
}

function updateAuthUI() {
  const authButtons = document.getElementById('nav-auth-buttons');
  const userMenu    = document.getElementById('nav-user-menu');
  const mobileAuth  = document.getElementById('mobile-auth');
  const adminLink   = document.getElementById('admin-panel-link');

  if (STATE.user) {
    if (authButtons) authButtons.style.display = 'none';
    if (userMenu) {
      userMenu.style.display = 'flex';
      const nameEl = document.getElementById('user-name');
      if (nameEl) nameEl.textContent = STATE.user.name.split(' ')[0];
    }
    if (adminLink) adminLink.style.display = STATE.user.isAdmin ? 'flex' : 'none';
    if (mobileAuth) {
      mobileAuth.innerHTML = `<a class="mobile-nav-link" onclick="logout()">${t('logout')}</a>`;
    }
    showNotifBell();
    refreshNotifCount();
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
    if (mobileAuth) {
      mobileAuth.innerHTML = `<a class="mobile-nav-link" onclick="openAuth(); closeMobileMenu()">${t('login')} / ${t('signup')}</a>`;
    }
    hideNotifBell();
  }
}

/* ─── NOTIFICATION CENTER ─────────────────────────────── */
const NOTIF_STATE = {
  items: [],
  loaded: false,
  loading: false,
  open: false,
  markAllInFlight: false,
  pollTimer: null
};

function showNotifBell() {
  const wrap = document.getElementById('notif-wrap');
  if (wrap) wrap.style.display = 'flex';
  const mobileRow = document.getElementById('mobile-notif-row');
  if (mobileRow) {
    mobileRow.style.display = 'flex';
    // Also make sure the mobile notification button is visible
    const mobileBtn = document.getElementById('mobile-notif-open');
    if (mobileBtn) mobileBtn.style.display = 'inline-flex';
  }
}
function hideNotifBell() {
  const wrap = document.getElementById('notif-wrap');
  if (wrap) wrap.style.display = 'none';
  const mobileRow = document.getElementById('mobile-notif-row');
  if (mobileRow) mobileRow.style.display = 'none';
  // Never leave another account's notifications visible on this browser.
  NOTIF_STATE.items = [];
  NOTIF_STATE.loaded = false;
  closeNotifPanel();
  setNotifBadge(0);
}
function setNotifBadge(n) {
  const badge = document.getElementById('notif-count');
  if (!badge) return;
  badge.textContent = n;
  badge.classList.toggle('show', n > 0);
  const btn = document.getElementById('notif-btn');
  btn?.classList.toggle('has-unread', n > 0);
  btn?.setAttribute('aria-label', `${t('notif_open_notifications')} (${n} ${t('notif_unread_count')})`);
}
function isNotifPanelOpen() {
  return document.getElementById('notif-panel')?.classList.contains('open') || false;
}
function openNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.add('open');
  const btn = document.getElementById('notif-btn');
  btn?.setAttribute('aria-expanded', 'true');
  NOTIF_STATE.open = true;
  loadNotifications();
}
function closeNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.remove('open');
  const btn = document.getElementById('notif-btn');
  btn?.setAttribute('aria-expanded', 'false');
  NOTIF_STATE.open = false;
}
function toggleNotifPanel() {
  if (isNotifPanelOpen()) {
    closeNotifPanel();
  } else {
    openNotifPanel();
  }
}

/* Refresh only the unread badge (cheap, used on load + focus). */
async function refreshNotifCount() {
  if (!STATE.user || !STATE.token) return;
  try {
    const counts = await api('/notifications/unread-count');
    const n = counts?.unread ?? 0;
    setNotifBadge(n);
    if (NOTIF_STATE.loaded && NOTIF_STATE.open) {
      // Keep panel in sync if a notification was read elsewhere.
      const body = document.getElementById('notif-panel-body');
      const unreadEls = body?.querySelectorAll('.notif-item:not(.read)');
      if (unreadEls && unreadEls.length !== n) loadNotifications();
    }
  } catch { /* non-fatal */ }
}

/* Load the full list into the panel. */
async function loadNotifications() {
  if (!STATE.user || !STATE.token) return;
  if (NOTIF_STATE.loading) return;
  NOTIF_STATE.loading = true;
  const body = document.getElementById('notif-panel-body');
  if (body) body.innerHTML = `<div class="notif-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
  try {
    const data = await api('/notifications?limit=50');
    NOTIF_STATE.items = data.notifications || [];
    NOTIF_STATE.loaded = true;
    renderNotifications();
  } catch {
    if (body) {
      body.innerHTML = `<div class="notif-error">
        <i class="fas fa-exclamation-triangle"></i>
        <div>${t('notif_load_error')}</div>
        <button type="button" class="btn btn-outline btn-sm" style="margin-top:10px" onclick="loadNotifications()">${t('notif_retry')}</button>
      </div>`;
    }
  } finally {
    NOTIF_STATE.loading = false;
  }
}

const NOTIF_TYPE_ICONS = {
  general: 'fa-bell',
  product: 'fa-tshirt',
  category: 'fa-tags',
  order: 'fa-box',
  account: 'fa-user-circle',
  promotion: 'fa-bullhorn',
  system: 'fa-cogs'
};
function notifTypeLabel(type) {
  const map = {
    general: t('notif_type_general'),
    product: t('notif_type_product'),
    category: t('notif_type_category'),
    order: t('notif_type_order'),
    account: t('notif_type_account'),
    promotion: t('notif_type_promotion'),
    system: t('notif_type_system')
  };
  return map[type] || t('notif_type_general');
}
function notifFormatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return t('notif_just_now') || 'Now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return d.toLocaleDateString(STATE.lang === 'en' ? 'en-US' : undefined, { month: 'short', day: 'numeric' });
}
/* Only allow navigation to safe, same-origin app URLs. */
function notifSafeLink(link) {
  if (!link) return null;
  if (typeof link !== 'string') return null;
  const s = link.trim();
  if (!s) return null;
  if (/^\s*javascript:/i.test(s)) return null;
  if (/^\s*(https?:|data:|vbscript:|file:)/i.test(s)) return null;
  if (/^\/\//.test(s)) return null;
  // Allow root-relative, page-relative, or hash links only.
  if (s.startsWith('/') || s.startsWith('#') || s.startsWith('./') || s.startsWith('../') || !s.includes(':')) {
    return s;
  }
  return null;
}
/* Build localized title/message for order-status notifications (fall back to stored text).
   Server stores these in English; the app re-renders them in the active language. */
function notifOrderText(n) {
  const m = n && n.type === 'order' && n.metadata && typeof n.metadata.orderId === 'string' ? n.metadata : null;
  if (!m || ![ 'pending', 'processing', 'shipped', 'delivered', 'cancelled' ].includes(m.status)) return null;
  const msg = t('order_msg_' + m.status);
  if (!msg || msg === 'order_msg_' + m.status) return null;
  return {
    title: t('order_status_title') || n.title,
    message: msg.replace('{id}', m.orderId)
  };
}
function notifRenderItem(n) {
  const icon = NOTIF_TYPE_ICONS[n.type] || 'fa-bell';
  const safeLink = notifSafeLink(n.link);
  const isRead = !!n.isRead;
  const time = notifFormatDate(n.createdAt);
  const localized = notifOrderText(n);
  const title = localized ? localized.title : n.title;
  const message = localized ? localized.message : n.message;
  const linkHtml = safeLink
    ? `<button type="button" class="notif-item-link" data-link="${escapeHtml(safeLink)}">${t('notif_view')} →</button>`
    : '';
  return `<li class="notif-item ${isRead ? 'read' : ''}" onclick="notifMarkRead(${n.id})" role="button" tabindex="0" data-id="${n.id}">
    <div class="notif-item-icon"><i class="fas ${icon}"></i></div>
    <div class="notif-item-body">
      <div class="notif-item-title">
        ${isRead ? '' : '<span class="notif-unread-dot" aria-hidden="true"></span>'}
        ${escapeHtml(title)}
      </div>
      <div class="notif-item-msg">${escapeHtml(message)}</div>
      <div class="notif-item-meta">
        <span class="notif-type-tag">${escapeHtml(notifTypeLabel(n.type))}</span>
        ${time ? `<span>${time}</span>` : ''}
      </div>
      ${linkHtml}
    </div>
  </li>`;
}
function renderNotifications() {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;
  const items = NOTIF_STATE.items || [];
  if (!items.length) {
    body.innerHTML = `<div class="notif-empty">
      <i class="far fa-bell-slash"></i>
      <div class="notif-empty-title">${t('notif_empty')}</div>
      <div class="notif-empty-sub">${t('notif_empty_sub')}</div>
    </div>`;
    return;
  }
  body.innerHTML = `<ul class="notif-list">${items.map(notifRenderItem).join('')}</ul>`;
  const header = document.getElementById('notif-mark-all-btn');
  if (header) header.style.display = items.some(i => !i.isRead) ? '' : 'none';
  const unreadCount = NOTIF_STATE.items.filter(i => !i.isRead).length;
  setNotifBadge(unreadCount);
}
async function notifMarkRead(id) {
  const item = document.querySelector(`.notif-item[data-id="${id}"]`);
  try {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    NOTIF_STATE.items = NOTIF_STATE.items.map(n => (n.id === id ? { ...n, isRead: true } : n));
    if (item) {
      item.classList.add('read');
      const dot = item.querySelector('.notif-unread-dot');
      if (dot) dot.remove();
    }
    refreshNotifCount();
    const header = document.getElementById('notif-mark-all-btn');
    const anyUnread = NOTIF_STATE.items.some(i => !i.isRead);
    if (header) header.style.display = anyUnread ? '' : 'none';
  } catch {
    showToast(t('network_error'), 'error');
  }
}
async function notifMarkAllRead() {
  if (NOTIF_STATE.markAllInFlight) return;
  NOTIF_STATE.markAllInFlight = true;
  const btn = document.getElementById('notif-mark-all-btn');
  if (btn) btn.disabled = true;
  try {
    await api('/notifications/read-all', { method: 'POST' });
    NOTIF_STATE.items = NOTIF_STATE.items.map(n => ({ ...n, isRead: true }));
    renderNotifications();
    showToast(t('notif_all_read'));
  } catch {
    showToast(t('network_error'), 'error');
  } finally {
    NOTIF_STATE.markAllInFlight = false;
    if (btn) btn.disabled = false;
  }
}
function notifNavigate(link) {
  const safe = notifSafeLink(link);
  if (!safe) return;
  closeNotifPanel();
  // Route within the current single-page storefront.
  if (safe.startsWith('#')) {
    const target = document.querySelector(safe);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = safe;
  }
}
/* Re-apply translated header strings when the panel was rendered earlier. */
function reapplyNotifPanelLanguage() {
  if (!isNotifPanelOpen()) return;
  const body = document.getElementById('notif-panel-body');
  if (body && NOTIF_STATE.loaded) renderNotifications();
}

/* Keyboard: Escape closes the panel; Enter toggles a focused item. */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isNotifPanelOpen()) {
    closeNotifPanel();
    document.getElementById('notif-btn')?.focus();
  }
  if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('notif-item') && !e.target.classList.contains('read')) {
    const id = e.target.dataset.id;
    if (id) notifMarkRead(Number(id));
  }
});

/* Click outside the wrap closes the panel (mirrors user-dropdown). */
document.addEventListener('click', e => {
  if (isNotifPanelOpen() && !e.target.closest('.notif-wrap')) {
    closeNotifPanel();
  }
});

/* Handle notification action links safely via a delegated capture handler
   (runs before the item's own read-marking handler; navigates only to
   validated same-origin URLs). */
document.addEventListener('click', e => {
  const linkBtn = e.target.closest('.notif-item-link');
  if (!linkBtn) return;
  e.preventDefault();
  e.stopPropagation();
  const li = linkBtn.closest('.notif-item');
  const nid = li ? parseInt(li.dataset.id, 10) : 0;
  if (nid) notifMarkRead(nid);
  notifNavigate(linkBtn.dataset.link);
}, true);

/* Lightweight refresh: when the tab becomes visible again. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && STATE.user && !isNotifPanelOpen()) {
    refreshNotifCount();
  }
});

/* Verify a stored token is still valid on page load, and refresh user info */
async function verifySession() {
  if (!STATE.token) return;
  try {
    const user = await api('/auth/me');
    STATE.user = user;
    localStorage.setItem('shax_user', JSON.stringify(user));
  } catch {
    clearSession();
  }
}

/* ─── CHECKOUT ────────────────────────────────────────── */
/* Captured checkout location (set by shareLocation), sent with the order. */
let checkoutLocation = { lat: null, lng: null };

function shareLocation() {
  const status = document.getElementById('co-location-status');
  const btn    = document.getElementById('co-location-btn');
  if (!('geolocation' in navigator)) {
    if (status) { status.textContent = t('location_unsupported'); status.style.color = '#e74c3c'; }
    return;
  }
  if (status) { status.textContent = t('location_getting'); status.style.color = 'var(--white-dim)'; }
  if (btn) btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    pos => {
      checkoutLocation.lat = pos.coords.latitude;
      checkoutLocation.lng = pos.coords.longitude;
      if (status) { status.innerHTML = `<i class="fas fa-check-circle" style="color:#27ae60;margin-right:4px"></i>${t('location_shared')}`; status.style.color = '#27ae60'; }
      if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fas fa-location-crosshairs" style="margin-right:6px"></i>${t('location_update')}`; }
    },
    err => {
      if (btn) btn.disabled = false;
      let msg = t('location_denied');
      if (err.code === err.TIMEOUT) msg = t('location_timeout');
      if (status) { status.textContent = msg; status.style.color = '#e74c3c'; }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function openCheckout() {
  if (!STATE.user) { openAuth(); showToast(t('sign_in_required'), 'error'); return; }
  if (STATE.cart.length === 0) return;

  const overlay = document.getElementById('checkout-overlay');
  const modal   = document.getElementById('checkout-modal');
  if (!overlay || !modal) return;

  const total = getCartTotal();
  const shipping = getCartShipping();
  const grandTotal = total + shipping;

  modal.innerHTML = `
    <button class="modal-close" onclick="closeCheckout()" style="position:absolute;top:16px;right:16px;">
      <i class="fas fa-times"></i>
    </button>
    <div class="section-title" style="font-size:1.4rem;margin-bottom:24px;">
      ${t('checkout_title')} <span style="color:var(--gold)">SHAX</span>
    </div>
    <div style="background:var(--gray);border-radius:8px;padding:14px;margin-bottom:20px;">
      <div style="font-size:0.78rem;letter-spacing:1px;text-transform:uppercase;color:var(--white-dim);margin-bottom:8px;">Order Summary</div>
      ${STATE.cart.map(i => {
        const p = getCartProduct(i);
        if (!p) return '';
        return `
        <div style="display:flex;justify-content:space-between;font-size:0.88rem;padding:4px 0;">
          <span>${escapeHtml(getProductName(p))} × ${i.qty} (${escapeHtml(i.size)})</span>
          <span style="color:var(--gold)">${formatPrice(p.price * i.qty)}</span>
        </div>
      `;
      }).join('')}
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:4px 0;color:var(--white-dim);">
        <span>${t('cart_shipping')}</span>
        <span>${shipping > 0 ? formatPrice(shipping) : t('cart_free_shipping')}</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;font-weight:700;">
        <span>${t('cart_total')}</span>
        <span style="color:var(--gold)">${formatPrice(grandTotal)}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div class="form-group">
        <label class="form-label">${t('checkout_name')}</label>
        <input class="form-input" id="co-name" value="${escapeHtml(STATE.user.name)}" placeholder="${escapeHtml(t('checkout_name'))}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('checkout_phone')}</label>
        <input class="form-input" id="co-phone" placeholder="${escapeHtml(t('checkout_phone'))}" type="tel">
      </div>
      <div class="form-group">
        <label class="form-label">${t('checkout_city')}</label>
        <select class="form-input" id="co-city">
          <option value="">${escapeHtml(t('checkout_choose_city'))}</option>
          <option value="Erbil">${escapeHtml(t('city_erbil'))}</option>
          <option value="Slemani">${escapeHtml(t('city_slemani'))}</option>
          <option value="Duhok">${escapeHtml(t('city_duhok'))}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('checkout_address')}</label>
        <input class="form-input" id="co-address" placeholder="${escapeHtml(t('checkout_address'))}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('checkout_location')}</label>
        <button type="button" class="btn btn-outline" id="co-location-btn" onclick="shareLocation()" style="width:100%;justify-content:center">
          <i class="fas fa-location-crosshairs" style="margin-right:6px"></i>${t('checkout_send_location')}
        </button>
        <p id="co-location-status" style="font-size:0.78rem;color:var(--white-dim);margin-top:6px;text-align:center"></p>
      </div>
      <div class="form-group">
        <label class="form-label">${t('checkout_note')}</label>
        <input class="form-input" id="co-note" placeholder="${escapeHtml(t('checkout_note'))}">
      </div>
      <p style="font-size:0.8rem;color:var(--white-dim);text-align:center;">
        <i class="fas fa-paper-plane" style="color:#B0B8C4;margin-right:4px;"></i> ${t('checkout_note_bot')}
      </p>
      <button class="btn btn-gold btn-lg" id="co-submit-btn" onclick="placeOrder()" style="width:100%;">
        <i class="fas fa-paper-plane"></i> ${t('checkout_submit')}
      </button>
    </div>
  `;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  checkoutLocation = { lat: null, lng: null };  // fresh each time
}

function closeCheckout() {
  document.getElementById('checkout-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

async function placeOrder() {
  const name    = document.getElementById('co-name')?.value.trim();
  const phone   = document.getElementById('co-phone')?.value.trim();
  const city    = document.getElementById('co-city')?.value.trim();
  const address = document.getElementById('co-address')?.value.trim();
  const note    = document.getElementById('co-note')?.value.trim();

  if (!name || !phone || !address) {
    showToast(t('fill_required'), 'error');
    return;
  }
  if (!city) {
    showToast(t('choose_city_error'), 'error');
    return;
  }

  // Enforce the store-wide minimum order (on items, before shipping).
  if (STATE.minOrder > 0 && getCartTotal() < STATE.minOrder) {
    showToast(`${t('min_order_msg')} ${formatPrice(STATE.minOrder)}`, 'error');
    return;
  }

  const items = STATE.cart.map(i => {
    const p = getCartProduct(i);
    return {
      product_id: i.productId,
      product_name: p ? getProductName(p) : 'Product',
      size: i.size,
      color: i.color || '',
      quantity: i.qty,
      unit_price: p ? p.price : 0
    };
  });

  const btn = document.getElementById('co-submit-btn');
  if (btn) btn.disabled = true;

  try {
    await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: name, phone, city, address, note, items,
        latitude: checkoutLocation.lat, longitude: checkoutLocation.lng
      })
    });

    STATE.cart = [];
    saveCart();
    updateCartCount();
    renderCart();
    closeCheckout();
    showToast(t('order_success'));
  } catch (err) {
    showToast(err.message || t('order_failed'), 'error');
    if (btn) btn.disabled = false;
  }
}

/* ─── MOBILE MENU ─────────────────────────────────────── */
function toggleMobileMenu() {
  document.getElementById('mobile-menu')?.classList.toggle('open');
}
function closeMobileMenu() {
  document.getElementById('mobile-menu')?.classList.remove('open');
}

/* ─── USER DROPDOWN ──────────────────────────────────── */
function toggleUserDropdown() {
  document.getElementById('user-dropdown')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu-wrap')) {
    document.getElementById('user-dropdown')?.classList.remove('open');
  }
});

/* ─── HERO CARD GLOW ──────────────────────────────────── */
/* The 3D lightning rotation/spark is handled in bolt3d.js. Here we only add
   the subtle proximity glow on the card. No card-level click handler, so
   dragging/tapping the bolt never triggers a scroll. */
function setupHeroShirt() {
  const card = document.getElementById('bolt-card');
  if (!card) return;

  document.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / window.innerWidth;
    const dy = (e.clientY - cy) / window.innerHeight;
    const dist = Math.sqrt(dx * dx + dy * dy);
    card.classList.toggle('hovered', dist < 0.4);
  });
}

/* ─── SCROLL REVEAL ───────────────────────────────────── */
function setupScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(el => {
      if (el.isIntersecting) {
        el.target.classList.add('visible');
        observer.unobserve(el.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ─── COUNTER ANIMATION ───────────────────────────────── */
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    let count = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      count = Math.min(count + step, target);
      el.textContent = Math.floor(count) + (el.dataset.suffix || '');
      if (count >= target) clearInterval(timer);
    }, 20);
  });
}

/* ─── REAL HOMEPAGE STATS ─────────────────────────────── */
async function loadStats() {
  try {
    const stats = await api('/stats');

    const prodEl = document.getElementById('stat-products');
    const custEl = document.getElementById('stat-customers');

    if (prodEl) prodEl.dataset.count = String(stats.products ?? 0);
    if (custEl) custEl.dataset.count = String(stats.happyCustomers ?? 0);

    // If the About section is already on screen, the counter animation may have
    // already run with the placeholder 0s — re-run it now that targets are real.
    const about = document.getElementById('about');
    if (about) {
      const r = about.getBoundingClientRect();
      const visible = r.top < window.innerHeight && r.bottom > 0;
      if (visible) animateCounters();
    }
  } catch {
    // Stats are non-critical; on failure the counters just stay at 0+.
  }
}

/* ─── NAVBAR SCROLL ───────────────────────────────────── */
function setupNavbar() {
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    // Resolve the theme-aware navbar background (fall back to the dark glass
    // value if the CSS variables are unavailable for any reason).
    const cs = getComputedStyle(document.documentElement);
    const top = cs.getPropertyValue('--navbar-bg').trim() || 'rgba(10,10,10,0.92)';
    const scrolled = cs.getPropertyValue('--navbar-bg-scrolled').trim() || 'rgba(10,10,10,0.98)';
    nav.style.background = window.scrollY > 60 ? scrolled : top;
  });
}

/* ─── LOADER ──────────────────────────────────────────── */
function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  setTimeout(() => loader.classList.add('hidden'), 800);
}

/* ─── CATEGORY SLIDER ARROWS (bound once) ─────────────── */
function setupCategoryArrows() {
  const slider = document.getElementById('cat-slider');
  document.getElementById('cat-left')?.addEventListener('click', () => {
    slider?.scrollBy({ left: -200, behavior: 'smooth' });
  });
  document.getElementById('cat-right')?.addEventListener('click', () => {
    slider?.scrollBy({ left: 200, behavior: 'smooth' });
  });
}

/* ─── INIT ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await verifySession();
  await Promise.all([loadCategories(), loadFilters(), loadProducts()]);

  // Fetch the store-wide minimum order (0 = none).
  try { const mo = await api('/content/config/min-order'); STATE.minOrder = mo.minOrder || 0; }
  catch { STATE.minOrder = 0; }

  hideLoader();
  applyLanguage(STATE.lang);
  setupNavbar();
  setupSearch();
  setupSearch('search-input-mobile', 'search-results-mobile');
  setupCategoryArrows();
  setupCategories();
  setupFilters();
  renderProducts();
  renderCart();
  updateCartCount();
  updateAuthUI();
  setupHeroShirt();
  setupScrollReveal();
  loadStats();

  // Show the optional guest browsing prompt (only on pages that include it).
  maybeShowGuestPrompt();

  const aboutSection = document.getElementById('about');
  if (aboutSection) {
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) { animateCounters(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(aboutSection);
  }

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(tb => tb.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab)?.classList.add('active');
    });
  });

  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('signup-form')?.addEventListener('submit', handleSignup);

  document.getElementById('cart-overlay')?.addEventListener('click', closeCart);

  document.getElementById('product-modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('product-modal-overlay')) closeProductModal();
  });

  document.getElementById('auth-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('auth-overlay')) closeAuth();
  });

  document.getElementById('checkout-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('checkout-overlay')) closeCheckout();
  });
});
