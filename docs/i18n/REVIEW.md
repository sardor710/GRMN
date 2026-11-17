# Interface translation review (ru / kk)

Machine-drafted Russian and Kazakh (Cyrillic) interface strings from `messages/ru.json` and `messages/kk.json`, awaiting a native proofreader (plan decision L10).

How to review:

- Tick `[ ]` → `[x]` once a row is approved, or edit the string in `messages/<locale>.json` and tick it.
- Keep every `{placeholder}` exactly as in English. `{count, plural, …}` messages must keep the categories: Russian `one`/`few`/`many`/`other`, Kazakh `one`/`other` (`node --test tests/i18n-messages.test.mjs` checks this).
- Rows marked 🔒 **do not translate** are brand, product or service names (Garmin, fēnix, MARQ, Garmin Pay, Connect IQ…). Leave them as written, including ® and ™.
- Brand and product names embedded in longer strings also stay in Latin script.
- A blank or missing string falls back to English at runtime.
- Text in UPPER CASE is upper case in the source; some components also uppercase with CSS.

Totals: 309 keys in 17 namespaces, 23 marked do-not-translate.

## Meta

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `title` | Garmin Official Site \| GPS Technology for Every Lifestyle | Официальный сайт Garmin \| GPS-технологии для любого образа жизни | Garmin ресми сайты \| Кез келген өмір салтына арналған GPS технологиялары |
| [ ] | `description` | Garmin uses GPS technology in our products for aviation, marine, fitness, outdoor recreation, tracking and mobile apps. | Garmin использует GPS-технологии в продуктах для авиации, морского дела, фитнеса, активного отдыха, отслеживания и мобильных приложений. | Garmin авиация, теңіз, фитнес, белсенді демалыс, бақылау және мобильді қосымшаларға арналған өнімдерінде GPS технологияларын қолданады. |
| [ ] | `cartTitle` | Shopping Cart \| Garmin | Корзина \| Garmin | Себет \| Garmin |
| [ ] | `compareTitle` | Compare Smartwatches \| Garmin | Сравнение смарт-часов \| Garmin | Смарт-сағаттарды салыстыру \| Garmin |
| [ ] | `accountTitle` | My Account \| Garmin | Мой аккаунт \| Garmin | Менің аккаунтым \| Garmin |
| [ ] | `newsletterTitle` | Sign Up for News \| Garmin | Подписка на новости \| Garmin | Жаңалықтарға жазылу \| Garmin |
| [ ] | `newsletterDescription` | Get Garmin product news and promotions based on your preferences. | Получайте новости и акции Garmin с учётом ваших предпочтений. | Қалауларыңызға сай Garmin жаңалықтары мен акцияларын алыңыз. |
| [ ] | `blogTitle` | Garmin Blog \| The latest on our products and technology | Блог Garmin \| Новости о наших продуктах и технологиях | Garmin блогы \| Өнімдеріміз бен технологияларымыз туралы жаңалықтар |
| [ ] | `blogDescription` | The latest on Garmin products and technology. | Последние новости о продуктах и технологиях Garmin. | Garmin өнімдері мен технологиялары туралы соңғы жаңалықтар. |
| [ ] | `blogFallbackTitle` | Garmin Blog & Fitness Guides | Блог Garmin и фитнес-гиды | Garmin блогы және фитнес нұсқаулықтары |
| [ ] | `blogShortTitle` | Garmin Blog | Блог Garmin | Garmin блогы |
| [ ] | `blogPostTitle` | {title} \| Garmin Blog | {title} \| Блог Garmin | {title} \| Garmin блогы |
| [ ] | `blogPostDescription` | Explore training tips, GPS navigation guides, and smartwatch features on the official Garmin Blog. | Советы по тренировкам, руководства по GPS-навигации и возможности смарт-часов в официальном блоге Garmin. | Garmin ресми блогында жаттығу кеңестері, GPS навигация нұсқаулықтары және смарт-сағат мүмкіндіктері. |
| [ ] | `productFallbackTitle` | Garmin Smartwatches & GPS Devices | Смарт-часы и GPS-устройства Garmin | Garmin смарт-сағаттары мен GPS құрылғылары |
| [ ] | `productFallbackName` | Garmin Product | Продукт Garmin | Garmin өнімі |
| [ ] | `productTitle` | {name} \| Official Garmin Smartwatch | {name} \| Официальные смарт-часы Garmin | {name} \| Garmin ресми смарт-сағаты |
| [ ] | `productDescription` | Discover {name} with advanced GPS tracking, health metrics, and long battery life. | Откройте для себя {name}: продвинутое GPS-отслеживание, показатели здоровья и долгая работа от батареи. | {name}: озық GPS-бақылау, денсаулық көрсеткіштері және ұзақ батарея жұмысы. |
| [ ] | `catalogueTitle` | {title} \| Garmin | {title} \| Garmin | {title} \| Garmin |
| [ ] | `garminPayTitle` | Garmin Pay™ \| A Contactless Payment Solution | Garmin Pay™ \| Бесконтактная оплата | Garmin Pay™ \| Контактсыз төлем |
| [ ] | `garminPayDescription` | No wallet? No phone? No problem. Make contactless payments on the go with your compatible Garmin smartwatch or bike computer. | Без кошелька? Без телефона? Не проблема. Оплачивайте покупки бесконтактно с совместимых смарт-часов или велокомпьютера Garmin. | Әмиян жоқ па? Телефон жоқ па? Мәселе емес. Үйлесімді Garmin смарт-сағатымен немесе велокомпьютерімен жолда контактсыз төлеңіз. |

## BlogArticle

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `byline` | By {author} | Автор: {author} | Авторы: {author} |
| [ ] | `defaultReadTime` | 4 min read | 4 мин чтения | 4 мин оқу |
| [ ] | `backToAll` | ← Back to all articles | ← Все статьи | ← Барлық мақалалар |
| [ ] | `related` | Related Articles | Похожие статьи | Ұқсас мақалалар |

## BlogExplorer

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Blog | Блог | Блог |
| [ ] | `intro` | The latest on our products and technology. | Последние новости о наших продуктах и технологиях. | Өнімдеріміз бен технологияларымыз туралы соңғы жаңалықтар. |
| [ ] | `searchPlaceholder` | Search Blog | Поиск по блогу | Блогтан іздеу |
| [ ] | `clearFilters` | Clear filters | Сбросить фильтры | Сүзгілерді тазалау |
| [ ] | `empty` | No articles found. | Статьи не найдены. | Мақалалар табылмады. |
| [ ] | `categories.automotive` | Automotive | Авто | Көлік |
| [ ] | `categories.aviation` | Aviation | Авиация | Авиация |
| [ ] | `categories.fitness` | Fitness | Фитнес | Фитнес |
| [ ] | `categories.fish-and-hunt` | Fish & Hunt | Рыбалка и охота | Балық аулау және аңшылық |
| [ ] | `categories.marine` | Marine | Море | Теңіз |
| [ ] | `categories.outdoor` | Outdoor Recreation | Активный отдых | Белсенді демалыс |
| [ ] | `categories.health` | Health & News | Здоровье и новости | Денсаулық және жаңалықтар |
| [ ] | `categories.saved-by-garmin` | Saved by Garmin | Спасены благодаря Garmin | Garmin арқасында құтқарылғандар |

## BlogPage

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `eyebrow` | Garmin Blog | Блог Garmin | Garmin блогы |
| [ ] | `heroAlt` | Garmin Blog | Блог Garmin | Garmin блогы |

## CatalogueGrid

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `compare` | Compare | Сравнить | Салыстыру |
| [ ] | `clearAll` | Clear all filters ({count}) | Сбросить все фильтры ({count}) | Барлық сүзгілерді тазалау ({count}) |
| [ ] | `activity` | Activity | Активность | Белсенділік |
| [ ] | `level` | Level | Уровень | Деңгей |
| [ ] | `caseSize` | Case Size | Размер корпуса | Корпус өлшемі |
| [ ] | `sortBy` | Sort By | Сортировка | Сұрыптау |
| [ ] | `empty` | No products match your filters. | Нет товаров, соответствующих фильтрам. | Сүзгілерге сәйкес тауарлар жоқ. |
| [ ] | `sort.featured` | Featured Products | Рекомендуемые | Ұсынылғандар |
| [ ] | `sort.priceAsc` | Price: Low to High | Цена: по возрастанию | Баға: өсу бойынша |
| [ ] | `sort.priceDesc` | Price: High to Low | Цена: по убыванию | Баға: кему бойынша |
| [ ] | `sort.name` | Name: A to Z | Название: от А до Я | Атауы: А-дан Я-ға дейін |
| [ ] | `groups.battery` | Battery Life in Smartwatch Mode | Время работы в режиме смарт-часов | Смарт-сағат режиміндегі батарея жұмысы |
| [ ] | `groups.hardware` | Hardware | Оборудование | Жабдық |
| [ ] | `groups.connectivity` | Connectivity | Подключение | Байланыс |
| [ ] | `groups.series` | Series | Серия | Серия |
| [ ] | `groups.otherDevices` | Other Devices | Другие устройства | Басқа құрылғылар |
| [ ] | `activities.boating` | Boating | Яхтинг | Қайықпен жүзу |
| [ ] | `activities.cycling` | Cycling | Велоспорт | Велоспорт |
| [ ] | `activities.diving` | Diving | Дайвинг | Дайвинг |
| [ ] | `activities.flying` | Flying | Полёты | Ұшу |
| [ ] | `activities.golfing` | Golfing | Гольф | Гольф |
| [ ] | `activities.hiking` | Hiking | Походы | Жаяу серуен |
| [ ] | `activities.running` | Running | Бег | Жүгіру |
| [ ] | `activities.strength` | Strength | Силовые тренировки | Күш жаттығулары |
| [ ] | `activities.swimming` | Swimming | Плавание | Жүзу |
| [ ] | `activities.tacticalTraining` | Tactical training | Тактическая подготовка | Тактикалық дайындық |
| [ ] | `activities.triathlon` | Triathlon | Триатлон | Триатлон |
| [ ] | `activities.walking` | Walking | Ходьба | Жаяу жүру |
| [ ] | `levels.entry` | Entry | Начальный | Бастапқы |
| [ ] | `levels.advanced` | Advanced | Продвинутый | Озық |
| [ ] | `levels.premium` | Premium | Премиум | Премиум |
| [ ] | `levels.youth` | Youth | Детский | Балалар |
| [ ] | `caseSizes.small` | Small (35 to 43 mm) | Маленький (35–43 мм) | Кіші (35–43 мм) |
| [ ] | `caseSizes.medium` | Medium (44 to 49 mm) | Средний (44–49 мм) | Орташа (44–49 мм) |
| [ ] | `caseSizes.large` | Large (≥ 50 mm) | Большой (≥ 50 мм) | Үлкен (≥ 50 мм) |

## CataloguePage

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `smartwatches.title` | Smartwatches | Смарт-часы | Смарт-сағаттар |
| [ ] | `smartwatches.heading` | ALL SMARTWATCHES | ВСЕ СМАРТ-ЧАСЫ | БАРЛЫҚ СМАРТ-САҒАТТАР |
| [ ] | `running.title` | GPS Running Watches | GPS-часы для бега | Жүгіруге арналған GPS сағаттар |
| [ ] | `running.heading` | ALL RUNNING SMARTWATCHES | ВСЕ СМАРТ-ЧАСЫ ДЛЯ БЕГА | ЖҮГІРУГЕ АРНАЛҒАН БАРЛЫҚ СМАРТ-САҒАТТАР |
| [ ] | `running.heroLabel` | SPORTS & FITNESS | СПОРТ И ФИТНЕС | СПОРТ ЖӘНЕ ФИТНЕС |
| [ ] | `running.heroBlurb` | Running Smartwatches | Смарт-часы для бега | Жүгіруге арналған смарт-сағаттар |

## CategoryGrid

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Shop by Category | Покупки по категориям | Санаттар бойынша сатып алу |
| [ ] | `shop` | SHOP | КУПИТЬ | САТЫП АЛУ |
| [ ] | `tiles.smartwatches` | SMARTWATCHES | СМАРТ-ЧАСЫ | СМАРТ-САҒАТТАР |
| [ ] | `tiles.autoHome` | AUTO & HOME | АВТО И ДОМ | КӨЛІК ЖӘНЕ ҮЙ |
| [ ] | `tiles.sportsFitness` | SPORTS & FITNESS | СПОРТ И ФИТНЕС | СПОРТ ЖӘНЕ ФИТНЕС |
| [ ] | `tiles.outdoorRecreation` | OUTDOOR RECREATION | АКТИВНЫЙ ОТДЫХ | БЕЛСЕНДІ ДЕМАЛЫС |
| [ ] | `tiles.marine` | MARINE | МОРСКАЯ ТЕХНИКА | ТЕҢІЗ ТЕХНИКАСЫ |
| [ ] | `tiles.aviation` | AVIATION | АВИАЦИЯ | АВИАЦИЯ |

## Footer

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `navLabel` | Global Footer Navigation | Навигация в подвале сайта | Сайттың төменгі навигациясы |
| [ ] | `region` | United States | США | АҚШ |
| [ ] | `social` | Garmin on {network} | Garmin в {network} | {network} желісіндегі Garmin |
| [ ] | `copyright` | © Garmin Ltd. or its subsidiaries. All rights reserved. | © Garmin Ltd. или её дочерние компании. Все права защищены. | © Garmin Ltd. немесе оның еншілес компаниялары. Барлық құқықтар қорғалған. |
| [ ] | `columns.customerService` | CUSTOMER SERVICE | ОБСЛУЖИВАНИЕ КЛИЕНТОВ | КЛИЕНТТЕРГЕ ҚЫЗМЕТ |
| [ ] | `columns.company` | COMPANY | КОМПАНИЯ | КОМПАНИЯ |
| [ ] | `columns.platforms` | PLATFORMS | ПЛАТФОРМЫ | ПЛАТФОРМАЛАР |
| [ ] | `columns.forBusiness` | FOR BUSINESS | ДЛЯ БИЗНЕСА | БИЗНЕСКЕ |
| [ ] | `links.supportCenter` | Support Center | Центр поддержки | Қолдау орталығы |
| [ ] | `links.contactUs` | Contact Us | Связаться с нами | Бізбен байланыс |
| [ ] | `links.shippingReturnsRefunds` | Shipping, Returns & Refunds | Доставка, возврат и возмещение | Жеткізу, қайтару және өтемақы |
| [ ] | `links.orderSupport` | Order Support | Поддержка заказов | Тапсырыс бойынша қолдау |
| [ ] | `links.warrantyInformation` | Warranty Information | Гарантия | Кепілдік туралы ақпарат |
| [ ] | `links.dataManagement` | Data Management | Управление данными | Деректерді басқару |
| [ ] | `links.dealsPromotions` | Deals & Promotions | Скидки и акции | Жеңілдіктер мен акциялар |
| [ ] | `links.findADealer` | Find a Dealer | Найти дилера | Дилерді табу |
| [ ] | `links.aboutUs` | About Us | О нас | Біз туралы |
| [ ] | `links.blog` | Blog | Блог | Блог |
| [ ] | `links.investors` | Investors | Инвесторам | Инвесторларға |
| [ ] | `links.newsroom` | Newsroom | Пресс-центр | Баспасөз орталығы |
| [ ] | `links.retailStore` | Retail Store | Фирменный магазин | Фирмалық дүкен |
| [ ] | `links.corporateSustainability` | Corporate Sustainability | Устойчивое развитие | Тұрақты даму |
| [ ] | `links.careerOpportunities` | Career Opportunities | Карьера | Мансап |
| [ ] | `links.earlyCareers` | Early Careers | Начало карьеры | Мансаптың басы |
| [ ] | `links.garminConnect` 🔒 **do not translate** | Garmin Connect | Garmin Connect | Garmin Connect |
| [ ] | `links.garminExpress` 🔒 **do not translate** | Garmin Express | Garmin Express | Garmin Express |
| [ ] | `links.connectIq` 🔒 **do not translate** | Connect IQ | Connect IQ | Connect IQ |
| [ ] | `links.flygarmin` 🔒 **do not translate** | flyGarmin | flyGarmin | flyGarmin |
| [ ] | `links.garminExplore` 🔒 **do not translate** | Garmin Explore | Garmin Explore | Garmin Explore |
| [ ] | `links.navionicsChartInstaller` 🔒 **do not translate** | Navionics Chart Installer | Navionics Chart Installer | Navionics Chart Installer |
| [ ] | `links.garminHealth` 🔒 **do not translate** | Garmin Health | Garmin Health | Garmin Health |
| [ ] | `links.dealerResourceCenter` | Dealer Resource Center | Ресурсный центр для дилеров | Дилерлерге арналған ресурс орталығы |
| [ ] | `links.developers` | Developers | Разработчикам | Әзірлеушілерге |
| [ ] | `links.inreachProfessional` 🔒 **do not translate** | inReach Professional | inReach Professional | inReach Professional |
| [ ] | `links.marineFirstResponderSolutions` | Marine First Responder Solutions | Решения для морских спасательных служб | Теңіз құтқару қызметтеріне арналған шешімдер |
| [ ] | `links.seastarInformationService` | SeaStar® Information Service | Информационный сервис SeaStar® | SeaStar® ақпараттық сервисі |
| [ ] | `links.automotiveOem` | Automotive OEM | OEM для автопроизводителей | Автоөндірушілерге арналған OEM |
| [ ] | `links.rvOem` | RV OEM | OEM для автодомов | Автоүйлерге арналған OEM |
| [ ] | `links.sensors` | Sensors | Датчики | Датчиктер |
| [ ] | `links.ambassadorsAffiliates` | Ambassadors & Affiliates | Амбассадоры и партнёры | Амбассадорлар мен серіктестер |
| [ ] | `links.corporateSponsorships` | Corporate Sponsorships | Корпоративное спонсорство | Корпоративтік демеушілік |
| [ ] | `legal.siteMap` | Site Map | Карта сайта | Сайт картасы |
| [ ] | `legal.termsOfUse` | Terms of Use | Условия использования | Пайдалану шарттары |
| [ ] | `legal.privacy` | Privacy | Конфиденциальность | Құпиялылық |
| [ ] | `legal.security` | Security | Безопасность | Қауіпсіздік |
| [ ] | `legal.digitalAccessibility` | Digital Accessibility | Цифровая доступность | Цифрлық қолжетімділік |

## Header

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `homeLabel` | Navigate to Garmin.com | Перейти на Garmin.com | Garmin.com сайтына өту |
| [ ] | `siteNav` | Site Navigation | Навигация по сайту | Сайт навигациясы |
| [ ] | `mobileNav` | Mobile Site Navigation | Мобильная навигация по сайту | Сайттың мобильді навигациясы |
| [ ] | `menuLabel` | {label} menu | Меню «{label}» | «{label}» мәзірі |
| [ ] | `help` | Help | Помощь | Көмек |
| [ ] | `search` | Search | Поиск | Іздеу |
| [ ] | `account` | Account | Аккаунт | Аккаунт |
| [ ] | `cartLabel` | Cart, {count, plural, one {# item} other {# items}} | Корзина, {count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}} | Себет, {count, plural, one {# тауар} other {# тауар}} |
| [ ] | `toggleMenu` | Toggle Menu | Открыть или закрыть меню | Мәзірді ашу немесе жабу |
| [ ] | `searchHeading` | Search Garmin | Поиск по Garmin | Garmin бойынша іздеу |
| [ ] | `searchPlaceholder` | Search products | Поиск товаров | Тауарларды іздеу |
| [ ] | `closeSearch` | Close search | Закрыть поиск | Іздеуді жабу |
| [ ] | `noResults` | No featured products found. | Рекомендуемые товары не найдены. | Ұсынылған тауарлар табылмады. |
| [ ] | `takeover` | HOLIDAY SALE | ПРАЗДНИЧНАЯ РАСПРОДАЖА | МЕРЕКЕЛІК ЖЕҢІЛДІКТЕР |
| [ ] | `nav.smartwatches` | Smartwatches | Смарт-часы | Смарт-сағаттар |
| [ ] | `nav.sportsFitness` | Sports & Fitness | Спорт и фитнес | Спорт және фитнес |
| [ ] | `nav.outdoorRecreation` | Outdoor Recreation | Активный отдых | Белсенді демалыс |
| [ ] | `nav.autoHome` | Auto & Home | Авто и дом | Көлік және үй |
| [ ] | `nav.marine` | Marine | Морская техника | Теңіз техникасы |
| [ ] | `nav.aviation` | Aviation | Авиация | Авиация |
| [ ] | `nav.sale` | Sale | Распродажа | Жеңілдіктер |
| [ ] | `groups.products` | Products | Продукты | Өнімдер |
| [ ] | `groups.maps` | Maps | Карты | Карталар |
| [ ] | `groups.accessoriesPlans` | Accessories & Plans | Аксессуары и планы | Аксессуарлар және жоспарлар |
| [ ] | `groups.discover` | Discover | Узнать больше | Толығырақ |
| [ ] | `groups.communities` | Communities | Сообщества | Қауымдастықтар |
| [ ] | `groups.oemSolutions` | OEM Solutions | OEM-решения | OEM шешімдері |
| [ ] | `groups.appsPlans` | Apps & Plans | Приложения и планы | Қосымшалар және жоспарлар |
| [ ] | `groups.chartsMaps` | Charts & Maps | Карты и схемы | Карталар мен сызбалар |
| [ ] | `groups.markets` | Markets | Сегменты | Сегменттер |
| [ ] | `groups.appsServices` | Apps & Services | Приложения и сервисы | Қосымшалар және сервистер |
| [ ] | `groups.aviationDatabases` | Aviation Databases | Авиационные базы данных | Авиациялық дерекқорлар |
| [ ] | `links.allSmartwatches` | All Smartwatches | Все смарт-часы | Барлық смарт-сағаттар |
| [ ] | `links.healthFitnessTracking` | Health & Fitness Tracking | Здоровье и фитнес-трекинг | Денсаулық пен фитнес-трекинг |
| [ ] | `links.designYourOwnWatch` | Design Your Own Watch | Создайте свои часы | Өз сағатыңызды жасаңыз |
| [ ] | `links.watchesForWomen` | Watches for Women | Женские часы | Әйелдер сағаттары |
| [ ] | `links.fashionHybridSmartwatches` | Fashion & Hybrid Smartwatches | Стильные и гибридные смарт-часы | Сәнді және гибридті смарт-сағаттар |
| [ ] | `links.marqLuxuryWatchCollection` | MARQ Luxury Watch Collection | Коллекция люксовых часов MARQ | MARQ люкс сағаттар коллекциясы |
| [ ] | `links.running` | Running | Бег | Жүгіру |
| [ ] | `links.multisportTriathlete` | Multisport & Triathlete | Мультиспорт и триатлон | Мультиспорт және триатлон |
| [ ] | `links.adventure` | Adventure | Приключения | Саяхат |
| [ ] | `links.swimming` | Swimming | Плавание | Жүзу |
| [ ] | `links.diving` | Diving | Дайвинг | Дайвинг |
| [ ] | `links.golf` | Golf | Гольф | Гольф |
| [ ] | `links.kidsSmartwatches` | Kids Smartwatches | Детские смарт-часы | Балаларға арналған смарт-сағаттар |
| [ ] | `links.outdoorMaps` | Outdoor Maps | Туристические карты | Туристік карталар |
| [ ] | `links.golfCourseLocator` | Golf Course Locator | Поиск гольф-полей | Гольф алаңдарын іздеу |
| [ ] | `links.accessories` | Accessories | Аксессуары | Аксессуарлар |
| [ ] | `links.apps` | Apps | Приложения | Қосымшалар |
| [ ] | `links.servicePlans` | Service Plans | Сервисные планы | Сервистік жоспарлар |
| [ ] | `links.garminPay` 🔒 **do not translate** | Garmin Pay | Garmin Pay | Garmin Pay |
| [ ] | `links.garminTechnology` | Garmin Technology | Технологии Garmin | Garmin технологиялары |
| [ ] | `links.watchFinder` | Watch Finder | Подбор часов | Сағат таңдау |
| [ ] | `links.cirqaSmartBand` | CIRQA™ Smart Band | Смарт-браслет CIRQA™ | CIRQA™ смарт-білезігі |
| [ ] | `links.cycling` | Cycling | Велоспорт | Велоспорт |
| [ ] | `links.tacxIndoorCycling` | Tacx® Indoor Cycling | Велотренажёры Tacx® | Tacx® велотренажерлары |
| [ ] | `links.scalesMonitors` | Scales & Monitors | Весы и мониторы | Таразылар мен мониторлар |
| [ ] | `links.cyclingMaps` | Cycling Maps | Велосипедные карты | Велосипед карталары |
| [ ] | `links.smartwatchAccessories` | Smartwatch Accessories | Аксессуары для смарт-часов | Смарт-сағат аксессуарлары |
| [ ] | `links.cyclingAccessories` | Cycling Accessories | Велоаксессуары | Велоаксессуарлар |
| [ ] | `links.indoorTrainingAccessories` | Indoor Training Accessories | Аксессуары для домашних тренировок | Үйде жаттығуға арналған аксессуарлар |
| [ ] | `links.garminCoach` 🔒 **do not translate** | Garmin Coach | Garmin Coach | Garmin Coach |
| [ ] | `links.garminMarathonSeries` 🔒 **do not translate** | Garmin Marathon Series | Garmin Marathon Series | Garmin Marathon Series |
| [ ] | `links.garminPros` 🔒 **do not translate** | Garmin Pros | Garmin Pros | Garmin Pros |
| [ ] | `links.studentAthletes` | Student Athletes | Студенты-спортсмены | Студент-спортшылар |
| [ ] | `links.handhelds` | Handhelds | Портативные навигаторы | Портативті навигаторлар |
| [ ] | `links.satelliteCommunicators` | Satellite Communicators | Спутниковые коммуникаторы | Спутниктік коммуникаторлар |
| [ ] | `links.offRoadMotorsports` | Off-Road & Motorsports | Бездорожье и мотоспорт | Жолсыздық және мотоспорт |
| [ ] | `links.adventureWatches` | Adventure Watches | Часы для приключений | Саяхатқа арналған сағаттар |
| [ ] | `links.sportsmanTactical` | Sportsman & Tactical | Охота и тактика | Аңшылық және тактика |
| [ ] | `links.dogTrackingTraining` | Dog Tracking & Training | Трекинг и дрессировка собак | Иттерді бақылау және үйрету |
| [ ] | `links.optics` | Optics | Оптика | Оптика |
| [ ] | `links.equine` | Equine | Конный спорт | Ат спорты |
| [ ] | `links.delormeAtlasGazetteer` 🔒 **do not translate** | DeLorme Atlas & Gazetteer | DeLorme Atlas & Gazetteer | DeLorme Atlas & Gazetteer |
| [ ] | `links.inreachAccount` | inReach Account | Аккаунт inReach | inReach аккаунты |
| [ ] | `links.womenOfAdventure` 🔒 **do not translate** | Women of Adventure | Women of Adventure | Women of Adventure |
| [ ] | `links.carsRvCameras` | Cars, RV & Cameras | Автомобили, автодома и камеры | Көліктер, автоүйлер және камералар |
| [ ] | `links.motorcycles` | Motorcycles | Мотоциклы | Мотоциклдер |
| [ ] | `links.trucks` | Trucks | Грузовики | Жүк көліктері |
| [ ] | `links.carAudio` | Car Audio | Автозвук | Көлік аудиожүйесі |
| [ ] | `links.homeAudio` | Home Audio | Домашнее аудио | Үй аудиожүйесі |
| [ ] | `links.mapUpdates` | Map Updates | Обновления карт | Карта жаңартулары |
| [ ] | `links.purchaseNewMaps` | Purchase New Maps | Купить новые карты | Жаңа карталар сатып алу |
| [ ] | `links.inDashMaps` | In-Dash Maps | Карты для штатных систем | Штаттық жүйелерге арналған карталар |
| [ ] | `links.offRoadMaps` | Off-Road Maps | Карты бездорожья | Жолсыздық карталары |
| [ ] | `links.automotive` | Automotive | Автопроизводителям | Автоөндірушілерге |
| [ ] | `links.rv` | RV | Автодома | Автоүйлер |
| [ ] | `links.stealthbox` 🔒 **do not translate** | Stealthbox® | Stealthbox® | Stealthbox® |
| [ ] | `links.chartplottersFishfinders` | Chartplotters & Fishfinders | Картплоттеры и эхолоты | Картплоттерлер мен эхолоттар |
| [ ] | `links.liveSonar` | Live Sonar | Сонары реального времени | Нақты уақыт сонарлары |
| [ ] | `links.audio` | Audio | Аудио | Аудио |
| [ ] | `links.transducers` | Transducers | Датчики эхолота | Эхолот датчиктері |
| [ ] | `links.trollingMotors` | Trolling Motors | Троллинговые моторы | Троллинг моторлары |
| [ ] | `links.iceFishingBundlesKits` | Ice Fishing Bundles & Kits | Комплекты для зимней рыбалки | Қысқы балық аулауға арналған жинақтар |
| [ ] | `links.radar` | Radar | Радары | Радарлар |
| [ ] | `links.autopilots` | Autopilots | Автопилоты | Автопилоттар |
| [ ] | `links.lighting` | Lighting | Освещение | Жарықтандыру |
| [ ] | `links.handheldsSmartwatches` | Handhelds & Smartwatches | Портативные устройства и смарт-часы | Портативті құрылғылар мен смарт-сағаттар |
| [ ] | `links.vhfAis` | VHF & AIS | УКВ и АИС | УКВ және АИЖ |
| [ ] | `links.sonarBlackBoxes` | Sonar Black Boxes | Блоки сонаров | Сонар блоктары |
| [ ] | `links.antennasSensors` | Antennas & Sensors | Антенны и датчики | Антенналар мен датчиктер |
| [ ] | `links.cameras` | Cameras | Камеры | Камералар |
| [ ] | `links.sailing` | Sailing | Парусный спорт | Желкенді спорт |
| [ ] | `links.digitalSwitching` | Digital Switching | Цифровая коммутация | Цифрлық коммутация |
| [ ] | `links.engineCutoffMob` | Engine Cutoff/MOB | Отключение двигателя / «Человек за бортом» | Қозғалтқышты өшіру / «Адам суда» |
| [ ] | `links.newCharts` | New Charts | Новые карты | Жаңа карталар |
| [ ] | `links.builtInUpdates` | Built-in Updates | Встроенные обновления | Кірістірілген жаңартулар |
| [ ] | `links.updatingCharts` | Updating Charts | Обновление карт | Карталарды жаңарту |
| [ ] | `links.navionicsBoatingApp` | Navionics Boating App | Приложение Navionics Boating | Navionics Boating қосымшасы |
| [ ] | `links.integration` | Integration | Интеграция | Интеграция |
| [ ] | `links.softwareUpdates` | Software Updates | Обновления ПО | Бағдарлама жаңартулары |
| [ ] | `links.systemBuilder` | System Builder | Конструктор систем | Жүйе конструкторы |
| [ ] | `links.activecaptain` 🔒 **do not translate** | ActiveCaptain | ActiveCaptain | ActiveCaptain |
| [ ] | `links.navigationRadios` | Navigation & Radios | Навигация и радиостанции | Навигация және радиостанциялар |
| [ ] | `links.flightDisplaysInstruments` | Flight Displays & Instruments | Пилотажные дисплеи и приборы | Ұшу дисплейлері мен аспаптары |
| [ ] | `links.engineIndicationSystems` | Engine Indication Systems | Системы индикации двигателя | Қозғалтқыш индикациясы жүйелері |
| [ ] | `links.integratedFlightDecks` | Integrated Flight Decks | Интегрированные кабины | Біріктірілген кабиналар |
| [ ] | `links.datalinksConnectivity` | Datalinks & Connectivity | Каналы передачи данных и связь | Деректер арналары және байланыс |
| [ ] | `links.audioPanels` | Audio Panels | Аудиопанели | Аудиопанельдер |
| [ ] | `links.weather` | Weather | Погода | Ауа райы |
| [ ] | `links.traffic` | Traffic | Воздушная обстановка | Әуе қозғалысы |
| [ ] | `links.adsBTransponders` | ADS-B & Transponders | ADS-B и транспондеры | ADS-B және транспондерлер |
| [ ] | `links.portableGpsWearables` | Portable GPS & Wearables | Портативные GPS и носимые устройства | Портативті GPS және тағылатын құрылғылар |
| [ ] | `links.generalAviation` | General Aviation | Авиация общего назначения | Жалпы мақсаттағы авиация |
| [ ] | `links.businessAviation` | Business Aviation | Деловая авиация | Іскерлік авиация |
| [ ] | `links.experimental` | Experimental | Экспериментальные ВС | Эксперименттік ӘК |
| [ ] | `links.helicopters` | Helicopters | Вертолёты | Тікұшақтар |
| [ ] | `links.governmentDefense` | Government & Defense | Госсектор и оборона | Мемлекеттік сектор және қорғаныс |
| [ ] | `links.garminPilot` 🔒 **do not translate** | Garmin Pilot | Garmin Pilot | Garmin Pilot |
| [ ] | `links.safetyManagementSystem` | Safety Management System | Система управления безопасностью | Қауіпсіздікті басқару жүйесі |
| [ ] | `links.aerodata` 🔒 **do not translate** | AeroData | AeroData | AeroData |
| [ ] | `links.flygarmin` 🔒 **do not translate** | flyGarmin | flyGarmin | flyGarmin |
| [ ] | `links.fltplanServices` | FltPlan Services | Сервисы FltPlan | FltPlan сервистері |
| [ ] | `links.aviationDatabaseUpdates` | Aviation Database Updates | Обновления авиационных баз данных | Авиациялық дерекқорларды жаңарту |
| [ ] | `links.autonomi` 🔒 **do not translate** | Autonomí | Autonomí | Autonomí |
| [ ] | `links.planesync` 🔒 **do not translate** | PlaneSync | PlaneSync | PlaneSync |
| [ ] | `links.promotions` | Promotions | Акции | Акциялар |
| [ ] | `links.support` | Support | Поддержка | Қолдау |
| [ ] | `links.training` | Training | Обучение | Оқыту |
| [ ] | `promos.holidaySale.title` | HOLIDAY SALE | ПРАЗДНИЧНАЯ РАСПРОДАЖА | МЕРЕКЕЛІК ЖЕҢІЛДІКТЕР |
| [ ] | `promos.holidaySale.copy` | Save big on great holiday gifts | Большие скидки на праздничные подарки | Мерекелік сыйлықтарға үлкен жеңілдіктер |
| [ ] | `promos.fenix9.title` 🔒 **do not translate** | FĒNIX® 9 | FĒNIX® 9 | FĒNIX® 9 |
| [ ] | `promos.fenix9.copy` | The ultimate smartwatch | Совершенные смарт-часы | Мінсіз смарт-сағат |
| [ ] | `promos.edge1060.title` 🔒 **do not translate** | EDGE® 1060 | EDGE® 1060 | EDGE® 1060 |
| [ ] | `promos.edge1060.copy` | Premium cycling computer with hands-free voice control | Премиальный велокомпьютер с голосовым управлением | Дауыспен басқарылатын премиум велокомпьютер |
| [ ] | `promos.garminDrive.title` | GARMIN DRIVE™ NAVIGATORS | НАВИГАТОРЫ GARMIN DRIVE™ | GARMIN DRIVE™ НАВИГАТОРЛАРЫ |
| [ ] | `promos.garminDrive.copy` | Simplify your drive with new ultrawide displays | Новые сверхширокие дисплеи упрощают вождение | Жаңа өте кең дисплейлер жүргізуді жеңілдетеді |
| [ ] | `promos.axis.title` | AXIS™ FLIGHT DISPLAYS | ПИЛОТАЖНЫЕ ДИСПЛЕИ AXIS™ | AXIS™ ҰШУ ДИСПЛЕЙЛЕРІ |
| [ ] | `promos.axis.copy` | Integrated flight displays for experimental and certified piston aircraft | Интегрированные пилотажные дисплеи для экспериментальных и сертифицированных поршневых самолётов | Эксперименттік және сертификатталған поршеньді ұшақтарға арналған біріктірілген ұшу дисплейлері |

## HomeFeatured

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `featured` | FEATURED | РЕКОМЕНДУЕМ | ҰСЫНАМЫЗ |
| [ ] | `shop` | Shop | Купить | Сатып алу |
| [ ] | `previous` | Previous | Назад | Артқа |
| [ ] | `next` | Next | Вперёд | Алға |

## HomeHero

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `label` | Featured Garmin products | Избранные продукты Garmin | Garmin-нің таңдаулы өнімдері |
| [ ] | `shop` | SHOP | КУПИТЬ | САТЫП АЛУ |
| [ ] | `previous` | Previous slide | Предыдущий слайд | Алдыңғы слайд |
| [ ] | `next` | Next slide | Следующий слайд | Келесі слайд |
| [ ] | `play` | Play slideshow | Запустить слайд-шоу | Слайд-шоуды қосу |
| [ ] | `pause` | Pause slideshow | Приостановить слайд-шоу | Слайд-шоуды кідірту |
| [ ] | `status` | Slide {current} of {total}: {title} | Слайд {current} из {total}: {title} | {total} слайдтың {current}-сі: {title} |

## HomeSignup

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Sign up for News | Подпишитесь на новости | Жаңалықтарға жазылыңыз |
| [ ] | `placeholder` | john@example.com | ivan@example.com | aidar@example.com |
| [ ] | `submit` | Submit | Отправить | Жіберу |
| [ ] | `copy` | Get product news and promotions based on your preferences, devices and services. | Получайте новости о продуктах и акциях с учётом ваших предпочтений, устройств и сервисов. | Қалауларыңызға, құрылғыларыңыз бен сервистеріңізге сай өнім жаңалықтары мен акциялар туралы хабар алыңыз. |
| [ ] | `privacy` | Learn about email privacy. | Узнайте о конфиденциальности email-рассылок. | Электрондық пошта құпиялылығы туралы біліңіз. |

## HomeTiles

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `promoLabel` | Featured collections | Избранные коллекции | Таңдаулы коллекциялар |
| [ ] | `storiesLabel` | Garmin stories | Истории Garmin | Garmin оқиғалары |
| [ ] | `categoriesHeading` | SHOP BY CATEGORY | ПОКУПКИ ПО КАТЕГОРИЯМ | САНАТТАР БОЙЫНША САТЫП АЛУ |

## NotFound

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Page not found | Страница не найдена | Бет табылмады |
| [ ] | `body` | The page you are looking for does not exist. | Страница, которую вы ищете, не существует. | Сіз іздеген бет жоқ. |
| [ ] | `home` | Go to homepage | На главную | Басты бетке өту |

## ProductCard

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `price` | {price} USD | {price} USD | {price} USD |
| [ ] | `andUp` | and up | и выше | бастап |

## RelatedProducts

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | You May Also Like | Вам также может понравиться | Сізге мыналар да ұнауы мүмкін |

## WearablesHero

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Most Popular Smartwatches | Самые популярные смарт-часы | Ең танымал смарт-сағаттар |
