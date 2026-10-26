# AgentBond — Test Kalitesi ve Güvenlik Kapsamı İncelemesi

Bu inceleme, 4B-9 doğrulamasından sonra yürütülen salt okunur analizdir.
Kaynak: `contracts/AgentBondEscrow.sol`, `contracts/test/AgentBondEscrow.t.sol`,
`src/lib/escrow-contract.test.ts`, `src/hooks/useContractVerification.test.ts`,
`src/hooks/useEscrowWrite.test.ts`, `src/components/CreateTaskSheet.test.tsx`.

---

## 1. Frontend Test Kalitesi

### 1.1 `escrow-contract.test.ts` (20 test)

**Gerçek davranış mı, mock çağrısı mı?**
Tamamen gerçek davranış. `vi.resetModules()` + dinamik import ile modül sıfırdan yükleniyor; hiçbir fonksiyon mock'lanmıyor. Her test gerçek regex değerlendirmesini sınıyor.

**Güvenlik açısından eksik koşul?**
T-2a ile T-2b özdeş davranışı (`''` → `false`) iki ayrı test ile kapsıyor. Bu tekrar bilinçli — "env tanımsız" senaryosunun belgelenmesi amacıyla. Tekrar, işlevsel açıdan değil, belgeleme açısından kasıtlı.

**Hata olsa bile geçer mi?**
Hayır. `isContractDeployed` regex'i tamamen farklı bir mantıkla değiştirilmediği sürece T-1..T-8 doğrudan değerlendirme sonucunu sınıyor.

**Yanlış pozitif riski?**
T-9 (format geçerli ≠ deployed) bir belgeleme testi olarak değerlendirilebilir. Regex kasıtlı olarak sıfır adresi geçiyor; bu doğru tasarım ama anlık okumada şaşırtıcı görünebilir. Mevcut yorumlar bunu açıklıyor.

**Gereksiz tekrar?**
T-2a/T-2b işlevsel olarak özdeş. Belgeleme değeri dışında birleştirilebilir. Düşük öncelik.

---

### 1.2 `useContractVerification.test.ts` (15 test)

**T-15 stale testi — gerçek korumayı sınıyor mu?**
Kısmen. Test, eski promise'in `unmount` sonrasında yeni instance'ı etkilemediğini doğruluyor. Ancak *aynı instance üzerinde* adres prop'u değiştiğinde (yeniden render) eski promise'in sonucunun yok sayılıp sayılmadığı test edilmiyor. `useContractVerification` hook'u argüman almıyor — `CONTRACT_ADDRESS` modül scope'ta sabit. Bu nedenle "aynı instance'ta adres değişimi" senaryosu production'da olası değil; tasarım gereği bu durum oluşmuyor. **Doğrulandı — tasarım sınırı belgelenmeli.**

**publicClient undefined patikası (T-11):**
`mockReturnValueOnce(undefined)` kullanıyor. Eğer hook ikinci render'da tekrar `usePublicClient`'ı çağırırsa (StrictMode), ikinci çağrı varsayılan mock'a düşer. `contractVerified`'ın yalnızca `false` olduğunu doğruluyor ama `status` değerini kontrol etmiyor. **Test boşluğu (düşük):** `status` değeri hangi senkron başlangıç değerinde kaldığı doğrulanmamış.

**"checking" durumu ve gerçek UI davranışı:**
T-12 ve T-13'te `status === 'checking'` ilk render'da doğrulanıyor. Bu gerçek UI davranışını yansıtıyor (spinner göster, yazma engelle). **Doğrulandı.**

**Yanlış pozitif riski:**
`mockWagmi.getCode` proxy fonksiyonu (`(p) => mockWagmi.getCode(p)`) ile tanımlanıyor. Bu, her testte `mockWagmi.getCode = vi.fn()...` atamasının etki etmesini sağlıyor. Eğer bu proxy kaldırılırsa tüm mock testler sessizce kırılır. **Kanıt yetersiz — kırılgan mock mimarisi, şu an çalışıyor.**

---

### 1.3 `useEscrowWrite.test.ts` (23 test)

**Her yazma yolu doğru korumalı mı?**
Evet. T-16a–T-22f altı yazma yolunun tamamını (`submitWork`, `approveWork`, `requestRefund`, `createTask`, `approve`, `fund`) hem `false` hem `true` senaryosuyla sınıyor. **Doğrulandı.**

**`useFundTask` iki `useWriteContract` mock'u doğru mu eşleştirilmiş?**
`mockReturnValueOnce` çift çağrısı sıralı dönüş sağlıyor: ilk çağrı `writeApprove`, ikinci `writeFund`. Hook'un iç çağrı sırası sabit kaldığı sürece bu doğru çalışıyor. Ancak hook refactor edilip çağrı sırası değişirse testler sssizce yanlış mock'u test eder. **Tasarım riski (düşük-orta):** Mock'ların hangi slot'a gittiğini belgeleyen bir yorum var, bu iyi; ama positional mock yerine named mock daha sağlam olurdu.

**`approve()` için token, spender, miktar, chainId kontrolleri:**
T-21a–T-21g gerçek argümanlar üzerinden yapılıyor — `expect.objectContaining` ile tüm dört alan ayrı ayrı doğrulanıyor. T-21e özellikle spender'ın `CONTRACT_ADDRESS` olduğunu ve `USDC_ADDRESS` olmadığını teyit ediyor. T-21f miktarın sınırsız (`type(uint256).max`) olmadığını, tam `taskAmount`'a eşit olduğunu doğruluyor. **Doğrulandı — güvenlik açısından kritik kontroller mevcut.**

**Eksik senaryo:**
`useFundTask`'ta `needsApproval === false` (yeterli allowance zaten var) durumunda `approve()` çağrısını atlama davranışı test edilmiyor. Mevcut testler `data: 0n` (sıfır allowance) ile çalışıyor. **Test boşluğu (orta):** Yeterli allowance durumunda `writeApprove`'un çağrılmaması gerekiyor; bu doğrulanmamış.

---

### 1.4 `CreateTaskSheet.test.tsx` (12 test)

**Form doğrulaması gerçek kullanıcı etkileşimiyle mi sınandı?**
Evet. `userEvent.type` ve `userEvent.click` kullanılıyor; sadece `fireEvent.submit` değil. `fillValidForm` yardımcısı provider adresi, açıklama, miktar ve deadline'ı sırasıyla dolduruyor. **Doğrulandı.**

**Disabled koşullar gerçek butona bakıyor mu?**
Evet. `screen.getByRole('button', { name: /create task/i })` ve `.toBeDisabled()` DOM'da gerçek attribute'u sınıyor. T-25a artık `disabled`'ı doğruluyor — bileşen + hook çift güvencesi test ediliyor. **Doğrulandı.**

**`execute` argümanları doğru mu?**
T-27 `calledProvider`, `calledDescription`, `calledAmount` (1_000_000n = 1 USDC), `calledDeadline > now` doğruluyor. Decimal dönüşümü (1 → 1_000_000n) test kapsamında. **Doğrulandı.**

**Eksik senaryo:**
`isPending === true` veya `isConfirming === true` durumlarında Submit butonunun disabled olması test edilmiyor. Mevcut mock'lar her zaman `isPending: false, isConfirming: false` döndürüyor. **Test boşluğu (düşük):** Loading sırasında double-submit koruması doğrulanmamış.

---

## 2. Solidity Test Kapsamı (60 test)

### 2.1 Fonksiyon ve Hata Durumu Kapsamı

| Fonksiyon | Happy Path | Erişim Kontrolü | Durum Geçişleri | Deadline | Reentrancy | Fuzz |
|---|---|---|---|---|---|---|
| `createTask` | H-1 | — | — | E-1..E-5, F-4 | — | — |
| `fundTask` | H-2, A-1 | R-1 | S-1, S-2 | — | Re-3 | A-4, F-2 |
| `submitWork` | H-3 | R-2, R-3 | S-3, S-4 | R-8, E-7, E-8 | — | — |
| `approveWork` | H-4, A-2 | R-4, R-5 | S-5..S-8, S-12 | — | Re-1 | A-4, F-2 |
| `requestRefund` | H-5, H-6, A-3 | R-6, R-7 | S-9..S-11, S-13 | R-9, E-9, E-10 | Re-2 | F-3 |
| `constructor` | — | — | — | — | — | E-6 |

**Kapsanmayan error selector'lar:**
- `ZeroAddress` — yalnızca constructor (E-6) ve `createTask(provider=0)` (E-2) test edilmiş. `fundTask`/`submitWork`/`approveWork`'te ZeroAddress fırlatılamaz — doğru, coverage eksiği yok.
- `ZeroAmount` — yalnızca `createTask` (E-1). Doğru, diğer fonksiyonlarda olası değil.
- `TaskNotFound` — E-15, dört fonksiyon için tek testte. **Doğrulandı.**

### 2.2 Invariant Testleri

| Invariant | İçerik | Kapsama |
|---|---|---|
| I-1 | Escrow token bakiyesi = Funded+Submitted görev miktarlarının toplamı | 256 runs × 500 calls = 128.000 çağrı, 0 revert |
| I-2 | Terminal durumlar emici (handler'da Completed/Refunded görev üzerinde işlem yok) | I-1 ile dolaylı |
| I-3 | Mevcut görevlerde employer/provider asla sıfır adres değil | Her run'da tüm görevler kontrol ediliyor |

**Kapsanmayan invariant:**
- "Hiçbir adres approve edilmeden doğrudan escrow bakiyesini çekemez" — bunu I-1 dolaylı olarak kapsamaktadır; doğrudan erişim girişimi token pull mekanizması olmadığı için fonksiyon arayüzünde mevcut değil. **Doğrulandı — ayrı test gereksiz.**
- "description alanı MAX_REF_LENGTH sınırını asla aşmaz" — contract state'te saklanan description'ın uzunluğu invariant olarak test edilmiyor. Handler `description: "handler-task"` kullanıyor (sabit kısa string). **Test boşluğu (düşük):** Handler'da rastgele uzunlukta description üretilmiyor; ancak `createTask`'ın `DescriptionTooLong` kontrolü E-11/E-12 ile unit test kapsamında.

### 2.3 Kapsanmayan Hata Durumları

**`fundTask` → `InvalidState` gerçek selector doğrulaması:**
S-1 ve S-2, `InvalidState` revert'ını `abi.encodeWithSelector` ile doğruluyor. **Doğrulandı.**

**Gerçek ERC-20 transfer hataları:**
E-16 (yetersiz bakiye) ve E-17 (sıfır allowance) `vm.expectRevert()` kullanıyor — spesifik selector değil, herhangi bir revert bekliyor. Bu kabul edilebilir çünkü `SafeERC20`'nin iç hata mesajı OZ'ye bağlı. **Doğrulandı (kabul edilebilir).**

**`approveWork` — Submitted olmayan durumlarda:**
S-5 (Created), S-6 (Funded), S-7 (Completed), S-8 (Refunded) durumları test edilmiş. Beş durumun dördü kapsanmış; Submitted → Completed geçişi H-4 ile kapsanmış. **Doğrulandı — tam kapsam.**

---

## 3. Ekonomik Tasarım Riski Değerlendirmesi

### Mevcut kural (contract kaynak kodu, satır 245-251)

```solidity
/// @dev Provider note: the employer retains refund rights after the deadline
///      even when work has been submitted but not yet approved. Providers
///      must treat the deadline as a hard commitment and negotiate any
///      extension before it passes.
```

`requestRefund` imzası (satır 257-259):
```solidity
TaskState state = task.state;
if (state != TaskState.Funded && state != TaskState.Submitted) {
    revert InvalidState(taskId, state);
}
```

**Test H-6** (`test_H6_refund_fromSubmitted`):
```
Deadline'a warp edilir → requestRefund çağrılır → Refunded durumu ve employer bakiyesi doğrulanır
```

### Ayrım: Doğru uygulama mı, ekonomik kabul edilebilirlik mi?

**Doğrulandı — doğru uygulandı:** `requestRefund`, `Submitted` durumunu açıkça kapsıyor. H-6 bu davranışın kasıtlı olduğunu ve doğru çalıştığını kanıtlıyor. Testler bu riski kasıtlı olarak geçiren değil, kasıtlı olarak kapsayan bir test.

**Tasarım riski — ekonomik kabul edilebilirlik kanıtlanmamış:** H-6'nın geçmesi, bu kuralın adil veya sürdürülebilir olduğunu kanıtlamaz. Yalnızca şunu kanıtlar: "bu kural doğru uygulanmış."

Pratikte risk şudur: provider, deadline'dan 1 saniye önce `submitWork` çağırır. Employer, deadline'da `requestRefund` çağırır. Provider teslim etmiş, employer hem teslim edilmiş çalışmayı alır hem de fonları geri çeker. Sözleşme bu senaryoyu engelleyen herhangi bir mekanizmaya sahip değil (`approveWork` yalnızca employer tarafından çağrılabilir).

**Mevcut belgeler bu riski açıkça kabul ediyor:**
- `requestRefund` NatSpec'i (satır 246-249): "Providers must treat the deadline as a hard commitment and negotiate any extension before it passes."
- MVP kapanış raporunda (`docs/mvp-closure-report.md`) B-2 bloker olarak listelenmiş, mainnet öncesi bağımsız denetim gerekiyor.

**Tasarım değişikliği önerisi bu rapor kapsamı dışındadır.** Kural kasıtlı olarak konulmuş, belgelenmiş ve testler doğru çalıştığını kanıtlıyor. Ekonomik risk gerçek ama bilinen ve kabul edilmiş.

---

## 4. Bulgular — Öncelikli Aksiyon Listesi

### A1 — `useFundTask` allowance bypass testi eksik
**Kategori:** Test boşluğu (orta)
**Dosya:** `src/hooks/useEscrowWrite.test.ts`
**Detay:** `data: 0n` (sıfır allowance) ile çalışan testler mevcut. Yeterli allowance (`data >= taskAmount`) durumunda `approve()` çağrısının atlanıp atlanmadığı (`writeApprove` çağrılmaması gerekiyor) doğrulanmamış. Bu, "zaten approve edilmiş fon için ikinci kez approve" senaryosunu kapsamıyor.
**Pratik etki:** Kullanıcı yeterli allowance olmasına rağmen gereksiz approve tx imzalamak zorunda kalabilir veya hook davranışı değiştiğinde test yakalamaz.
**Önerilen adım:** `data: VALID_AMOUNT + 1n` ile `approve()` çağrısında `writeApprove`'un çağrılmadığını doğrulayan bir test ekle.

### A2 — `CreateTaskSheet` loading sırasında double-submit koruması test edilmemiş
**Kategori:** Test boşluğu (düşük)
**Dosya:** `src/components/CreateTaskSheet.test.tsx`
**Detay:** `isPending: true` veya `isConfirming: true` ile mock kurulduğunda Submit butonunun disabled olması test edilmiyor. `canSubmit` bu koşulları içeriyor ama test kapsamı dışında.
**Pratik etki:** Loading state'te double-submit koruması regresyon geçirebilir; test yakalamaz.
**Önerilen adım:** `useCreateTask` mock'unu `isPending: true` ile döndüren tek bir test ekle; butonun disabled olduğunu doğrula.

### A3 — `useContractVerification` T-11'de `status` değeri doğrulanmamış
**Kategori:** Test boşluğu (düşük)
**Dosya:** `src/hooks/useContractVerification.test.ts`
**Detay:** `publicClient = undefined` durumunda `contractVerified === false` doğrulanıyor ama `status`'ün hangi değerde kaldığı (`'idle'` mi, başka bir şey mi) doğrulanmamış. Hook'un bu durumda hangi mesajı gösterdiği belirsiz.
**Pratik etki:** `publicClient` sağlanamadığında UI belirsiz bir banner gösterebilir.
**Önerilen adım:** T-11'e `status` assertion ekle.

### A4 — Invariant handler'da `description` uzunluğu rastgele üretilmiyor
**Kategori:** Test boşluğu (düşük)
**Dosya:** `contracts/test/AgentBondEscrow.t.sol` — `AgentBondHandler`
**Detay:** Handler sabit `"handler-task"` kullanıyor. Invariant sırasında 257+ byte description gönderilirse `DescriptionTooLong` revert eder — handler bunu zaten kontrol etmediğinden sıfır revert sayısı yanıltıcı. Unit testler (E-11, E-12) bu sınırı doğruluyor.
**Pratik etki:** Invariant coverage'ı göründüğünden daha dar.
**Önerilen adım:** Handler'a `bound(descLen, 0, 256)` ile sınırlı random description ekle veya mevcut durumu kabul et (E-11/E-12 yeterli).

### A5 — `requestRefund` sonrası provider ödeme alamaması — ekonomik tasarım riski belgelenmiş, izlenmiyor
**Kategori:** Tasarım riski (yüksek — bilinen, kabul edilmiş)
**Dosya:** `contracts/AgentBondEscrow.sol` (satır 245-251), `docs/mvp-closure-report.md`
**Detay:** Provider deadline'dan önce teslim eder; employer deadline'da refund alır. Teslim edilen çalışmanın ödenmemesi mümkün. Bu kural kasıtlı tasarım kararı, NatSpec'te ve MVP raporunda belgelenmiş.
**Pratik etki:** Mainnet'e açılırsa provider'lar ekonomik risk altında çalışır. İnsan kullanıcılar için hukuki/operasyonel risk; AI agent'lar için programatik güven sorunu.
**Önerilen adım:** Mainnet öncesi B-2 denetiminde bu kuralın onaylanması veya dispute/timelock mekanizması eklenmesi.

---

## 5. Özet Değerlendirme

| Alan | Toplam Test | Değerlendirme |
|---|---|---|
| Frontend (4 dosya) | 70 | Güvenlik critical path'leri kapsamlı; 2 orta, 2 düşük boşluk |
| Solidity (8 suite) | 60 | Fonksiyon ve hata kapsamı eksiksiz; invariant coverage geniş |
| Birlikte çalışma | 130 | Mock izolasyonu sağlam; env sızıntısı yok |
| Ekonomik güvence | — | Uygulama doğrulandı; tasarım riski belgelenmiş ve bilinçle kabul edilmiş |

**En yüksek öncelikli eylem:** A1 (allowance bypass testi) — üretim kodunda bir regresyonu gizleyebilecek tek orta-öncelikli boşluk.
