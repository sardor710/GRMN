# Interface translation review (ru / kk)

Machine-drafted Russian and Kazakh (Cyrillic) interface strings from `messages/ru.json` and `messages/kk.json`, awaiting a native proofreader (plan decision L10).

How to review:

- Tick `[ ]` → `[x]` once a row is approved, or edit the string in `messages/<locale>.json` and tick it.
- Keep every `{placeholder}` exactly as in English. `{count, plural, …}` messages must keep the categories: Russian `one`/`few`/`many`/`other`, Kazakh `one`/`other` (`node --test tests/i18n-messages.test.mjs` checks this).
- Rows marked 🔒 **do not translate** are brand, product or service names (Garmin, fēnix, MARQ, Garmin Pay, Connect IQ…). Leave them as written, including ® and ™.
- Brand and product names embedded in longer strings also stay in Latin script.
- A blank or missing string falls back to English at runtime.
- Text in UPPER CASE is upper case in the source; some components also uppercase with CSS.

Totals: 560 keys in 25 namespaces, 25 marked do-not-translate.

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

## Account

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `tabs.Profile` | Profile | Профиль | Профиль |
| [ ] | `tabs.Orders` | Orders | Заказы | Тапсырыстар |
| [ ] | `tabs.Devices` | Devices | Устройства | Құрылғылар |
| [ ] | `tabs.Subscriptions` | Subscriptions | Подписки | Жазылымдар |
| [ ] | `memberSince` | Member since {year} | Участник с {year} г. | {year} жылдан бері мүше |
| [ ] | `signOut` | Sign Out | Выйти | Шығу |
| [ ] | `cancel` | Cancel | Отмена | Бас тарту |
| [ ] | `notAvailable` | N/A | н/д | жоқ |
| [ ] | `fallbackProduct` | Garmin Product | Продукт Garmin | Garmin өнімі |
| [ ] | `fallbackEquipment` | Garmin Equipment | Оборудование Garmin | Garmin жабдығы |
| [ ] | `fallbackDevice` | Garmin Device | Устройство Garmin | Garmin құрылғысы |
| [ ] | `status.new` | new | новый | жаңа |
| [ ] | `status.processing` | processing | в обработке | өңделуде |
| [ ] | `status.shipped` | shipped | отправлен | жөнелтілді |
| [ ] | `status.delivered` | delivered | доставлен | жеткізілді |
| [ ] | `status.canceled` | canceled | отменён | бас тартылды |
| [ ] | `status.cancelled` | cancelled | отменён | бас тартылды |
| [ ] | `status.returned` | returned | возвращён | қайтарылды |
| [ ] | `details.title` | Account Details | Данные аккаунта | Аккаунт деректері |
| [ ] | `details.edit` | Edit Details | Изменить данные | Деректерді өзгерту |
| [ ] | `details.fullName` | Full Name | Полное имя | Толық аты-жөні |
| [ ] | `details.email` | Email Address | Электронная почта | Электрондық пошта |
| [ ] | `details.phone` | Phone Number | Номер телефона | Телефон нөмірі |
| [ ] | `details.cityCountry` | City, Country | Город, страна | Қала, ел |
| [ ] | `details.birthDate` | Birth Date | Дата рождения | Туған күні |
| [ ] | `details.locked` | Locked | Заблокировано | Құлыпталған |
| [ ] | `details.notProvided` | Not provided | Не указано | Көрсетілмеген |
| [ ] | `details.birthDateNote` | Verified during registration (immutable). | Подтверждено при регистрации (изменить нельзя). | Тіркелу кезінде расталған (өзгертуге болмайды). |
| [ ] | `details.password` | Password | Пароль | Құпиясөз |
| [ ] | `details.resetPassword` | Reset Password | Сбросить пароль | Құпиясөзді қалпына келтіру |
| [ ] | `form.fullName` | Full Name * | Полное имя * | Толық аты-жөні * |
| [ ] | `form.email` | Email Address * | Электронная почта * | Электрондық пошта * |
| [ ] | `form.phone` | Phone Number * | Номер телефона * | Телефон нөмірі * |
| [ ] | `form.country` | Country * | Страна * | Ел * |
| [ ] | `form.city` | City * | Город * | Қала * |
| [ ] | `form.otherCity` | + Other / Not Listed... | + Другой / нет в списке... | + Басқа / тізімде жоқ... |
| [ ] | `form.cityPlaceholder` | Enter your city name | Введите название города | Қала атауын енгізіңіз |
| [ ] | `form.selectList` | Select List | Выбрать из списка | Тізімнен таңдау |
| [ ] | `form.save` | Save Details | Сохранить данные | Деректерді сақтау |
| [ ] | `addresses.title` | Shipping Addresses ({count}/{max}) | Адреса доставки ({count}/{max}) | Жеткізу мекенжайлары ({count}/{max}) |
| [ ] | `addresses.add` | Add Address | Добавить адрес | Мекенжай қосу |
| [ ] | `addresses.maxReached` | Max {max} addresses reached | Достигнут максимум: {max, plural, one {# адрес} few {# адреса} many {# адресов} other {# адреса}} | Ең көбі {max, plural, one {# мекенжай} other {# мекенжай}} қосылды |
| [ ] | `addresses.primary` | Primary | Основной | Негізгі |
| [ ] | `addresses.edit` | Edit address | Изменить адрес | Мекенжайды өзгерту |
| [ ] | `addresses.delete` | Delete address | Удалить адрес | Мекенжайды жою |
| [ ] | `addresses.phone` | Phone: {phone} | Телефон: {phone} | Телефон: {phone} |
| [ ] | `addresses.currentPrimary` | Current primary address | Текущий основной адрес | Қазіргі негізгі мекенжай |
| [ ] | `addresses.setPrimaryTitle` | Set as primary shipping address | Сделать основным адресом доставки | Негізгі жеткізу мекенжайы ету |
| [ ] | `addresses.primaryNote` | Primary address (used in every order) | Основной адрес (используется во всех заказах) | Негізгі мекенжай (барлық тапсырыста қолданылады) |
| [ ] | `addresses.setPrimary` | Set as Primary | Сделать основным | Негізгі ету |
| [ ] | `recent.title` | Recent Order | Последний заказ | Соңғы тапсырыс |
| [ ] | `recent.viewAll` | View All Orders | Все заказы | Барлық тапсырыстар |
| [ ] | `recent.otherItems` | + {count} other item(s) | + ещё {count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}} | + тағы {count, plural, one {# тауар} other {# тауар}} |
| [ ] | `recent.placed` | Placed {date} | Оформлен {date} | Рәсімделді: {date} |
| [ ] | `recent.destination` | Destination: {title} ({city}) | Адрес: {title} ({city}) | Мекенжай: {title} ({city}) |
| [ ] | `recent.inspect` | Inspect Route Map → | Маршрут доставки → | Жеткізу бағыты → |
| [ ] | `orders.title` | Order History & Fulfillment Tracker ({count}) | История заказов и отслеживание ({count}) | Тапсырыстар тарихы және бақылау ({count}) |
| [ ] | `orders.hint` | Click any order to view details & route map | Нажмите на заказ, чтобы увидеть детали и маршрут | Мәліметтер мен бағытты көру үшін тапсырысты басыңыз |
| [ ] | `orders.placedOn` | Placed on {date} | Оформлен {date} | Рәсімделген күні: {date} |
| [ ] | `orders.additional` | + {count} additional product(s) | + ещё {count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}} | + тағы {count, plural, one {# өнім} other {# өнім}} |
| [ ] | `orders.shippingTo` | Shipping to: {address} | Доставка: {address} | Жеткізу: {address} |
| [ ] | `orders.total` | Order Total | Сумма заказа | Тапсырыс сомасы |
| [ ] | `orders.carrier` | Carrier: <b>{carrier}</b> | Перевозчик: <b>{carrier}</b> | Тасымалдаушы: <b>{carrier}</b> |
| [ ] | `orders.tracking` | Tracking #{number} | Трек-номер {number} | Трек-нөмір {number} |
| [ ] | `orders.view` | View Order Popup & Route Map → | Детали заказа и маршрут → | Тапсырыс мәліметтері және бағыт → |
| [ ] | `devices.title` | Registered Devices | Зарегистрированные устройства | Тіркелген құрылғылар |
| [ ] | `devices.register` | Register a device | Зарегистрировать устройство | Құрылғыны тіркеу |
| [ ] | `devices.serial` | Serial: {serial} | Серийный номер: {serial} | Сериялық нөмір: {serial} |
| [ ] | `devices.registered` | Registered {date} | Зарегистрировано {date} | Тіркелген күні: {date} |
| [ ] | `subscriptions.title` | Subscriptions & Plans | Подписки и планы | Жазылымдар мен жоспарлар |
| [ ] | `subscriptions.annual` | Annual | Годовая | Жылдық |
| [ ] | `subscriptions.monthly` | Monthly | Ежемесячная | Айлық |
| [ ] | `subscriptions.renews` | Renews {date} | Продление {date} | Ұзарту: {date} |
| [ ] | `subscriptions.perYear` | {price}/yr | {price}/год | {price}/жыл |
| [ ] | `subscriptions.perMonth` | {price}/mo | {price}/мес. | {price}/ай |
| [ ] | `subscriptions.active` | Active | Активна | Белсенді |
| [ ] | `addressForm.editTitle` | Edit Shipping Address | Изменить адрес доставки | Жеткізу мекенжайын өзгерту |
| [ ] | `addressForm.addTitle` | Add New Shipping Address | Новый адрес доставки | Жаңа жеткізу мекенжайы |
| [ ] | `addressForm.titleLabel` | Address Title (e.g. Home, Office, 2nd Home, Summer House) * | Название адреса (например, Дом, Офис, Дача) * | Мекенжай атауы (мысалы, Үй, Кеңсе, Саяжай) * |
| [ ] | `addressForm.titlePlaceholder` | e.g. 2nd Home, Villa, Office | например, Дача, Вилла, Офис | мысалы, Саяжай, Вилла, Кеңсе |
| [ ] | `addressForm.recipient` | Recipient Name * | Имя получателя * | Алушының аты * |
| [ ] | `addressForm.street` | Street Address * | Улица и дом * | Көше және үй * |
| [ ] | `addressForm.streetPlaceholder` | Street name, building, apartment/suite | Улица, дом, квартира/офис | Көше, үй, пәтер/кеңсе |
| [ ] | `addressForm.zip` | Postal / Zip Code | Почтовый индекс | Пошта индексі |
| [ ] | `addressForm.phone` | Contact Phone | Контактный телефон | Байланыс телефоны |
| [ ] | `addressForm.primary` | Set as Primary Shipping Address (used by default for all orders) | Сделать основным адресом доставки (по умолчанию для всех заказов) | Негізгі жеткізу мекенжайы ету (барлық тапсырыстар үшін әдепкі) |
| [ ] | `addressForm.saveChanges` | Save Changes | Сохранить изменения | Өзгерістерді сақтау |
| [ ] | `reset.title` | Password Reset Request | Запрос на сброс пароля | Құпиясөзді қалпына келтіру сұрауы |
| [ ] | `reset.body` | Clicking confirm will send an encrypted password recovery token to your registered email: | После подтверждения на вашу зарегистрированную почту будет отправлен зашифрованный токен для восстановления пароля: | Растағаннан кейін тіркелген поштаңызға құпиясөзді қалпына келтіретін шифрланған токен жіберіледі: |
| [ ] | `reset.send` | Send Reset Link | Отправить ссылку | Сілтеме жіберу |
| [ ] | `notify.nameEmailRequired` | Name and email are required fields. | Имя и почта обязательны. | Аты мен пошта міндетті. |
| [ ] | `notify.profileSaved` | Personal details successfully updated. | Личные данные обновлены. | Жеке деректер жаңартылды. |
| [ ] | `notify.resetSent` | Password reset instructions sent to {email} | Инструкции по сбросу пароля отправлены на {email} | Құпиясөзді қалпына келтіру нұсқаулары {email} мекенжайына жіберілді |
| [ ] | `notify.resetDispatched` | Password reset link dispatched to {email} | Ссылка для сброса пароля отправлена на {email} | Құпиясөзді қалпына келтіру сілтемесі {email} мекенжайына жіберілді |
| [ ] | `notify.maxAddresses` | Maximum limit of {max} shipping addresses reached. Please remove one before adding. | Достигнут лимит адресов доставки ({max}). Удалите один, чтобы добавить новый. | Жеткізу мекенжайларының шегіне ({max}) жеттіңіз. Жаңасын қосу үшін біреуін жойыңыз. |
| [ ] | `notify.titleRequired` | Address Title (e.g. Home, Office, 2nd Home) is required. | Укажите название адреса (например, Дом, Офис, Дача). | Мекенжай атауын көрсетіңіз (мысалы, Үй, Кеңсе, Саяжай). |
| [ ] | `notify.addressRequired` | Street, City, and Country are required. | Улица, город и страна обязательны. | Көше, қала және ел міндетті. |
| [ ] | `notify.addressUpdated` | Shipping address updated successfully. | Адрес доставки обновлён. | Жеткізу мекенжайы жаңартылды. |
| [ ] | `notify.addressSaved` | New shipping address saved. | Новый адрес доставки сохранён. | Жаңа жеткізу мекенжайы сақталды. |
| [ ] | `notify.addressError` | Error saving address. | Не удалось сохранить адрес. | Мекенжайды сақтау мүмкін болмады. |
| [ ] | `notify.confirmRemove` | Remove shipping address "{title}"? | Удалить адрес доставки «{title}»? | «{title}» жеткізу мекенжайын жою керек пе? |
| [ ] | `notify.addressRemoved` | Address "{title}" removed. | Адрес «{title}» удалён. | «{title}» мекенжайы жойылды. |
| [ ] | `notify.primarySet` | "{title}" is now set as your primary address for all orders. | «{title}» теперь ваш основной адрес для всех заказов. | «{title}» енді барлық тапсырыстар үшін негізгі мекенжайыңыз. |
| [ ] | `notify.selectedAddress` | Selected address | Выбранный адрес | Таңдалған мекенжай |
| [ ] | `notify.signedOut` | Signed out from session. | Вы вышли из аккаунта. | Сіз аккаунттан шықтыңыз. |
| [ ] | `notify.deviceForm` | Device registration form opened. | Открыта форма регистрации устройства. | Құрылғыны тіркеу формасы ашылды. |

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

## Cart

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Shopping Cart | Корзина | Себет |
| [ ] | `thankYou` | Thank you for your order! | Спасибо за заказ! | Тапсырысыңызға рахмет! |
| [ ] | `demoNotice` | This is a demo checkout — no payment was processed. Your cart has been cleared. | Это демонстрационное оформление заказа — оплата не проводилась. Корзина очищена. | Бұл тапсырысты рәсімдеудің демо-нұсқасы — төлем жүргізілген жоқ. Себет тазартылды. |
| [ ] | `continueShoppingButton` | Continue Shopping | Продолжить покупки | Сатып алуды жалғастыру |
| [ ] | `emptyHeading` | Your cart is empty | Ваша корзина пуста | Себетіңіз бос |
| [ ] | `emptyBody` | Looks like you haven't added anything yet. | Похоже, вы ещё ничего не добавили. | Сіз әлі ештеңе қоспаған сияқтысыз. |
| [ ] | `shopSmartwatches` | Shop Smartwatches | Смотреть смарт-часы | Смарт-сағаттарды қарау |
| [ ] | `item` | Item | Товар | Тауар |
| [ ] | `quantity` | Quantity | Количество | Саны |
| [ ] | `price` | Price | Цена | Бағасы |
| [ ] | `part` | Part {sku} | Арт. {sku} | Арт. {sku} |
| [ ] | `remove` | Remove | Удалить | Жою |
| [ ] | `decrease` | Decrease | Уменьшить | Азайту |
| [ ] | `increase` | Increase | Увеличить | Көбейту |
| [ ] | `continueShopping` | ← Continue shopping | ← Продолжить покупки | ← Сатып алуды жалғастыру |
| [ ] | `clear` | Clear cart | Очистить корзину | Себетті тазалау |
| [ ] | `summary` | Order Summary | Итог заказа | Тапсырыс қорытындысы |
| [ ] | `subtotal` | Subtotal | Промежуточный итог | Аралық сома |
| [ ] | `shipping` | Shipping | Доставка | Жеткізу |
| [ ] | `free` | FREE | БЕСПЛАТНО | ТЕГІН |
| [ ] | `tax` | Estimated tax | Расчётный налог | Болжамды салық |
| [ ] | `total` | Total | Итого | Барлығы |
| [ ] | `checkout` | Checkout | Оформить заказ | Тапсырысты рәсімдеу |
| [ ] | `freeShippingNote` | Free standard shipping on orders over $25. | Бесплатная стандартная доставка при заказе от 25 $. | 25 $-дан асатын тапсырыстарға стандартты жеткізу тегін. |

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

## Compare

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Compare Smartwatches | Сравнение смарт-часов | Смарт-сағаттарды салыстыру |
| [ ] | `intro` | Add up to {max} watches to compare specs side by side. | Добавьте до {max} моделей, чтобы сравнить характеристики. | Сипаттамаларды салыстыру үшін {max} үлгіге дейін қосыңыз. |
| [ ] | `addWatch` | Add a watch | Добавить часы | Сағат қосу |
| [ ] | `selectModel` | Select a model… | Выберите модель… | Үлгіні таңдаңыз… |
| [ ] | `empty` | Add a watch above to start comparing. | Добавьте часы выше, чтобы начать сравнение. | Салыстыруды бастау үшін жоғарыда сағат қосыңыз. |
| [ ] | `remove` | ✕ Remove | ✕ Убрать | ✕ Алып тастау |
| [ ] | `removeLabel` | Remove {name} | Убрать {name} | {name} алып тастау |
| [ ] | `shop` | Shop | Купить | Сатып алу |
| [ ] | `yes` | Yes | Да | Иә |
| [ ] | `back` | ← Back to all smartwatches | ← Ко всем смарт-часам | ← Барлық смарт-сағаттарға |
| [ ] | `rows.price` | Price | Цена | Бағасы |
| [ ] | `rows.family` | Product family | Линейка | Өнім желісі |
| [ ] | `rows.level` | Experience level | Уровень подготовки | Дайындық деңгейі |
| [ ] | `rows.caseSize` | Case size | Размер корпуса | Корпус өлшемі |
| [ ] | `rows.bestFor` | Best for | Лучше всего для | Кімге қолайлы |
| [ ] | `rows.customizable` | Customizable | Персонализация | Жекелендіру |
| [ ] | `rows.overview` | Overview | Обзор | Шолу |

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

## Newsletter

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Sign Up for News | Подпишитесь на новости | Жаңалықтарға жазылыңыз |
| [ ] | `intro` | Get product news and promotions based on your preferences, devices and services. | Получайте новости о продуктах и акциях с учётом ваших предпочтений, устройств и сервисов. | Қалауларыңызға, құрылғыларыңыз бен сервистеріңізге сай өнім жаңалықтары мен акциялар туралы хабар алыңыз. |
| [ ] | `emailLabel` | Email address | Адрес электронной почты | Электрондық пошта мекенжайы |
| [ ] | `placeholder` | john@example.com | ivan@example.com | aidar@example.com |
| [ ] | `signUp` | Sign up | Подписаться | Жазылу |
| [ ] | `privacyLink` | Learn about email privacy. | Узнайте о конфиденциальности email-рассылок. | Электрондық пошта құпиялылығы туралы біліңіз. |
| [ ] | `subscribedHeading` | You're subscribed! | Вы подписаны! | Сіз жазылдыңыз! |
| [ ] | `subscribedBody` | Thanks for signing up{hasEmail, select, yes {, {email}} other {}}. Look out for Garmin news{count, plural, =0 {} one { on # topic} other { on # topics}} in your inbox. | Спасибо за подписку{hasEmail, select, yes {, {email}} other {}}. Ждите новостей Garmin{count, plural, =0 {} one { по # теме} few { по # темам} many { по # темам} other { по # темы}} в своём почтовом ящике. | Жазылғаныңызға рахмет{hasEmail, select, yes {, {email}} other {}}. Garmin жаңалықтарын{count, plural, =0 {} one { # тақырып бойынша} other { # тақырып бойынша}} поштаңыздан күтіңіз. |
| [ ] | `updatePreferences` | Update Preferences | Изменить настройки | Баптауларды өзгерту |
| [ ] | `interestsLegend` | What are you interested in? | Что вас интересует? | Сізді не қызықтырады? |
| [ ] | `interestsHint` | Choose the topics you'd like to hear about. | Выберите темы, о которых хотите узнавать. | Білгіңіз келетін тақырыптарды таңдаңыз. |
| [ ] | `consent` | I agree to receive marketing emails from Garmin and understand I can unsubscribe at any time. Read about <link>email privacy</link>. | Я согласен(на) получать маркетинговые письма от Garmin и понимаю, что могу отписаться в любой момент. Подробнее о <link>конфиденциальности рассылок</link>. | Garmin-нен маркетингтік хаттар алуға келісемін және кез келген уақытта жазылымнан бас тарта алатынымды түсінемін. <link>Хат құпиялылығы</link> туралы оқыңыз. |
| [ ] | `subscribe` | Subscribe | Подписаться | Жазылу |
| [ ] | `interests.wearables` | Smartwatches & Wearables | Смарт-часы и носимые устройства | Смарт-сағаттар мен тағылатын құрылғылар |
| [ ] | `interests.running` | Running & Fitness | Бег и фитнес | Жүгіру және фитнес |
| [ ] | `interests.outdoor` | Outdoor Recreation | Активный отдых | Белсенді демалыс |
| [ ] | `interests.cycling` | Cycling | Велоспорт | Велоспорт |
| [ ] | `interests.golf` | Golf | Гольф | Гольф |
| [ ] | `interests.marine` | Marine | Морская техника | Теңіз техникасы |
| [ ] | `interests.aviation` | Aviation | Авиация | Авиация |
| [ ] | `interests.automotive` | Automotive & Home | Авто и дом | Көлік және үй |
| [ ] | `interests.health` | Health & Wellness | Здоровье и самочувствие | Денсаулық және әл-ауқат |
| [ ] | `interests.deals` | Deals & Promotions | Скидки и акции | Жеңілдіктер мен акциялар |

## NotFound

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Page not found | Страница не найдена | Бет табылмады |
| [ ] | `body` | The page you are looking for does not exist. | Страница, которую вы ищете, не существует. | Сіз іздеген бет жоқ. |
| [ ] | `home` | Go to homepage | На главную | Басты бетке өту |

## OrderDetails

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `title` | Order {number} | Заказ {number} | Тапсырыс {number} |
| [ ] | `copyNumber` | Copy Order Number | Скопировать номер заказа | Тапсырыс нөмірін көшіру |
| [ ] | `reference` | System Reference: {id} · Placed {date} | Системный номер: {id} · Оформлен {date} | Жүйелік нөмір: {id} · Рәсімделді: {date} |
| [ ] | `notAvailable` | N/A | н/д | жоқ |
| [ ] | `close` | Close popup | Закрыть окно | Терезені жабу |
| [ ] | `closeButton` | Close | Закрыть | Жабу |
| [ ] | `routeMap` | Fulfillment & Process Route Map | Маршрут обработки и доставки | Өңдеу және жеткізу бағыты |
| [ ] | `carrier` | Carrier: <b>{carrier}</b> | Перевозчик: <b>{carrier}</b> | Тасымалдаушы: <b>{carrier}</b> |
| [ ] | `tracking` | Tracking: | Трек-номер: | Трек-нөмір: |
| [ ] | `canceled` | This order was canceled. The standard delivery route was halted. | Заказ отменён. Стандартная доставка остановлена. | Тапсырыстан бас тартылды. Стандартты жеткізу тоқтатылды. |
| [ ] | `products` | Purchased Products ({count}) | Купленные товары ({count}) | Сатып алынған тауарлар ({count}) |
| [ ] | `itemsTotal` | Items Total: {amount} | Сумма товаров: {amount} | Тауарлар сомасы: {amount} |
| [ ] | `sku` | SKU / Item ID: {id} | Артикул / ID товара: {id} | Артикул / тауар ID: {id} |
| [ ] | `qty` | Qty: <b>{quantity}</b> × {price} | Кол-во: <b>{quantity}</b> × {price} | Саны: <b>{quantity}</b> × {price} |
| [ ] | `lineTotal` | Line Total | Сумма позиции | Позиция сомасы |
| [ ] | `noItems` | No line items detailed in this order record. | В этом заказе нет позиций. | Бұл тапсырыста позициялар жоқ. |
| [ ] | `shippingHeading` | Shipping Destination & Recipient | Адрес доставки и получатель | Жеткізу мекенжайы және алушы |
| [ ] | `note` | Note: “{comments}” | Комментарий: «{comments}» | Ескертпе: «{comments}» |
| [ ] | `paymentHeading` | Payment & Financial Summary | Оплата и итоги | Төлем және қорытынды |
| [ ] | `paymentStatus` | Payment Status: | Статус оплаты: | Төлем мәртебесі: |
| [ ] | `paymentMethod` | Payment Method: | Способ оплаты: | Төлем тәсілі: |
| [ ] | `paymentMethodValue` 🔒 **do not translate** | Garmin Pay / Visa (•••• 4242) | Garmin Pay / Visa (•••• 4242) | Garmin Pay / Visa (•••• 4242) |
| [ ] | `subtotal` | Subtotal: | Промежуточный итог: | Аралық сома: |
| [ ] | `shipping` | Shipping: | Доставка: | Жеткізу: |
| [ ] | `freeShipping` | FREE (Garmin Express) | БЕСПЛАТНО (Garmin Express) | ТЕГІН (Garmin Express) |
| [ ] | `grandTotal` | Grand Total: | Итого: | Жалпы сома: |
| [ ] | `certified` | Official Garmin Certified Order Record | Официальная запись заказа Garmin | Garmin-нің ресми тапсырыс жазбасы |
| [ ] | `print` | Print Invoice | Печать счёта | Шотты басып шығару |
| [ ] | `payment.paid` | paid | оплачен | төленді |
| [ ] | `payment.pending` | pending | ожидает оплаты | төлем күтілуде |
| [ ] | `payment.refunded` | refunded | возвращён | қайтарылды |
| [ ] | `milestones.created.label` | Order Placed & Verified | Заказ оформлен и подтверждён | Тапсырыс рәсімделді және расталды |
| [ ] | `milestones.created.description` | Order received by Garmin system and payment verified. | Заказ получен системой Garmin, оплата подтверждена. | Тапсырысты Garmin жүйесі қабылдады, төлем расталды. |
| [ ] | `milestones.processing.label` | Processing & Packaging | Обработка и упаковка | Өңдеу және қаптау |
| [ ] | `milestones.processing.description` | Items picked, inspected, and packed at Regional Fulfillment Center. | Товары собраны, проверены и упакованы в региональном центре выполнения заказов. | Тауарлар өңірлік орталықта жиналды, тексерілді және қапталды. |
| [ ] | `milestones.shipped.label` | Shipped & In Transit | Отправлен и в пути | Жөнелтілді және жолда |
| [ ] | `milestones.shipped.description` | Dispatched via {carrier}. Tracking: {tracking} | Отправлен через {carrier}. Трек-номер: {tracking} | {carrier} арқылы жөнелтілді. Трек-нөмір: {tracking} |
| [ ] | `milestones.out_for_delivery.label` | Out for Final Delivery | Передан курьеру | Курьерге берілді |
| [ ] | `milestones.out_for_delivery.description` | Courier assigned and en route to the designated delivery address. | Курьер назначен и направляется по адресу доставки. | Курьер тағайындалды және жеткізу мекенжайына бара жатыр. |
| [ ] | `milestones.delivered.label` | Package Delivered | Посылка доставлена | Сәлемдеме жеткізілді |
| [ ] | `milestones.delivered.description` | Package safely delivered and signed for by recipient. | Посылка доставлена и получена под подпись. | Сәлемдеме жеткізілді, алушы қол қойды. |

## ProductAccessories

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `quickFitHeading` | QuickFit® Watch Band Compatibility | Совместимость ремешков QuickFit® | QuickFit® бауларының үйлесімділігі |
| [ ] | `quickFitBody` | The fēnix® 8 series supports QuickFit bands: <b>20 mm</b> for 43 mm models, <b>22 mm</b> for 47 mm models, and <b>26 mm</b> for 51 mm models. Swap in seconds with no tools required. | Серия fēnix® 8 поддерживает ремешки QuickFit: <b>20 мм</b> для моделей 43 мм, <b>22 мм</b> для моделей 47 мм и <b>26 мм</b> для моделей 51 мм. Замена за секунды без инструментов. | fēnix® 8 сериясы QuickFit бауларын қолдайды: 43 мм үлгілерге <b>20 мм</b>, 47 мм үлгілерге <b>22 мм</b> және 51 мм үлгілерге <b>26 мм</b>. Құралсыз бірнеше секундта ауыстырылады. |
| [ ] | `toolFree` | Tool-Free Swap | Замена без инструментов | Құралсыз ауыстыру |
| [ ] | `empty` | No accessories found in this category. | В этой категории нет аксессуаров. | Бұл санатта аксессуарлар жоқ. |
| [ ] | `partNumber` | Part Number {partNumber} | Артикул {partNumber} | Артикул {partNumber} |
| [ ] | `currency` 🔒 **do not translate** | USD | USD | USD |
| [ ] | `added` | Added to Cart ✓ | Добавлено в корзину ✓ | Себетке қосылды ✓ |
| [ ] | `addToCart` | Add to Cart | В корзину | Себетке салу |
| [ ] | `categories.all` | All | Все | Барлығы |
| [ ] | `categories.bands` | Bands & Straps | Ремешки и браслеты | Баулар мен білезіктер |
| [ ] | `categories.sensors` | Heart Rate & Sensors | Пульсометры и датчики | Пульсометрлер мен датчиктер |
| [ ] | `categories.power` | Cables & Power | Кабели и питание | Кабельдер мен қуат |
| [ ] | `categories.protection` | Mounts & Protection | Крепления и защита | Бекіткіштер мен қорғаныс |
| [ ] | `categories.navigation` | Satellite & Navigation | Спутниковая связь и навигация | Спутниктік байланыс және навигация |

## ProductCard

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `price` | {price} USD | {price} USD | {price} USD |
| [ ] | `andUp` | and up | и выше | бастап |

## ProductTabs

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `tabs.overview` | Overview | Обзор | Шолу |
| [ ] | `tabs.specs` | Specs | Характеристики | Сипаттамалар |
| [ ] | `tabs.inTheBox` | In the Box | Комплектация | Жиынтық |
| [ ] | `tabs.accessories` | Accessories | Аксессуары | Аксессуарлар |
| [ ] | `tabs.maps` | Maps | Карты | Карталар |
| [ ] | `tabs.compatible` | Compatible Devices | Совместимые устройства | Үйлесімді құрылғылар |
| [ ] | `specifications` | Specifications | Технические характеристики | Техникалық сипаттамалар |
| [ ] | `mapsText` | Preloaded TopoActive maps plus support for downloadable outdoor, cycling and ski maps. | Предустановленные карты TopoActive и поддержка загружаемых туристических, велосипедных и горнолыжных карт. | Алдын ала орнатылған TopoActive карталары және жүктелетін туристік, велосипед және тау шаңғысы карталарына қолдау. |
| [ ] | `compatibleText` | Compatible with the Garmin Connect™ app and Connect IQ™ store on iPhone® and Android™ devices. | Совместимо с приложением Garmin Connect™ и магазином Connect IQ™ на устройствах iPhone® и Android™. | iPhone® және Android™ құрылғыларындағы Garmin Connect™ қосымшасымен және Connect IQ™ дүкенімен үйлесімді. |

## ProductTop

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `price` | {price} USD | {price} USD | {price} USD |
| [ ] | `previousImage` | Previous | Предыдущее фото | Алдыңғы сурет |
| [ ] | `nextImage` | Next | Следующее фото | Келесі сурет |
| [ ] | `partNumber` | Part Number {partNumber} | Артикул {partNumber} | Артикул {partNumber} |
| [ ] | `financing` | Starting at $69/mo or 0% APR with <brand>affirm</brand>. | От 69 $ в месяц или 0% годовых с <brand>affirm</brand>. | Айына 69 $-дан бастап немесе <brand>affirm</brand> арқылы жылдық 0%. |
| [ ] | `qualify` | See if you qualify | Проверьте, подходите ли вы | Сізге сай келетінін тексеріңіз |
| [ ] | `hsa` | HSA/FSA eligible for qualified customers. | Можно оплатить средствами HSA/FSA (для подходящих клиентов). | Сәйкес клиенттер HSA/FSA қаражатымен төлей алады. |
| [ ] | `learnMore` | Learn more | Подробнее | Толығырақ |
| [ ] | `caseSize` | Case Size | Размер корпуса | Корпус өлшемі |
| [ ] | `version` | Version | Версия | Нұсқа |
| [ ] | `modelColor` | Model/Color | Модель/цвет | Үлгі/түс |
| [ ] | `outOfStockNote` | Currently out of stock. | Сейчас нет в наличии. | Қазір қоймада жоқ. |
| [ ] | `shipsIn` | Available to ship in 1–3 business days. | Отправка в течение 1–3 рабочих дней. | 1–3 жұмыс күні ішінде жөнелтіледі. |
| [ ] | `outOfStock` | Out of Stock | Нет в наличии | Қоймада жоқ |
| [ ] | `added` | Added ✓ | Добавлено ✓ | Қосылды ✓ |
| [ ] | `addToCart` | Add to Cart | В корзину | Себетке салу |
| [ ] | `customize` | Customize | Настроить | Баптау |

## RelatedProducts

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | You May Also Like | Вам также может понравиться | Сізге мыналар да ұнауы мүмкін |

## WearablesHero

| ✓ | Key | English | Русский | Қазақша |
|---|---|---|---|---|
| [ ] | `heading` | Most Popular Smartwatches | Самые популярные смарт-часы | Ең танымал смарт-сағаттар |
