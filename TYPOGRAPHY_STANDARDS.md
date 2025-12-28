# Стандарты типографики проекта Verdia

## ⚠️ ВАЖНО: Эти размеры шрифтов должны использоваться ВЕЗДЕ в проекте

Если требуется использовать другие параметры шрифта, необходимо предупредить об этом.

## Мобильные устройства (по умолчанию)

### Заголовки
- **H1**: `text-[20px] leading-[28px]`
- **H2**: `text-[18px] leading-[24px]`

### Основной текст
- **Параграфы, body текст**: `text-[16px] leading-[24px]` или `text-base leading-[24px]`

### Мелкий текст
- **Ссылки, мелкий текст**: `text-[13px] leading-[16px]`
- **Метки, uppercase текст**: `text-[11px] leading-[14px]`

## Десктоп (lg: префикс)

### Заголовки
- **H1**: `lg:text-[32px] lg:leading-[40px]`
- **H2**: `lg:text-[24px] lg:leading-[30px]`

### Основной текст
- **Параграфы, body текст**: `lg:text-[16px] lg:leading-[24px]` или `lg:text-base lg:leading-[24px]`

### Мелкий текст
- **Ссылки, мелкий текст**: `lg:text-[14px] lg:leading-[16px]`
- **Метки, uppercase текст**: `lg:text-[12px] lg:leading-[14px]`

## Примеры использования

### H1 заголовок
```tsx
<h1 className="text-[20px] lg:text-[32px] leading-[28px] lg:leading-[40px]">
  Заголовок
</h1>
```

### H2 подзаголовок
```tsx
<h2 className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px]">
  Подзаголовок
</h2>
```

### Основной текст
```tsx
<p className="text-[16px] lg:text-[16px] leading-[24px] lg:leading-[24px]">
  Основной текст
</p>
```

### Ссылка
```tsx
<a className="text-[13px] lg:text-[14px] leading-[16px] lg:leading-[16px]">
  Ссылка
</a>
```

### Метка
```tsx
<p className="text-[11px] lg:text-[12px] leading-[14px] lg:leading-[14px] uppercase">
  Метка
</p>
```

## Правила

1. **Всегда используйте эти размеры** на всех страницах проекта
2. **Если требуется другой размер** - предупредить пользователя перед применением
3. **Не отклоняйтесь от стандартов** без явного разрешения

