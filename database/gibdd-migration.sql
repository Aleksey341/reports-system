-- Migration for GIBDD (Traffic Accidents) data
-- Created: 2025-10-04

-- Table for storing traffic accident statistics
CREATE TABLE IF NOT EXISTS gibdd_data (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER REFERENCES municipalities(id) ON DELETE CASCADE,
  period DATE NOT NULL, -- Month and year (YYYY-MM-01)

  -- Дорожно-транспортные происшествия (всего)
  dtp_total INTEGER DEFAULT 0,
  dtp_total_dead INTEGER DEFAULT 0,
  dtp_total_injured INTEGER DEFAULT 0,

  -- ДТП и пострадавшие пешеходы
  dtp_pedestrians INTEGER DEFAULT 0,
  dtp_pedestrians_dead INTEGER DEFAULT 0,
  dtp_pedestrians_injured INTEGER DEFAULT 0,

  -- ДТП и пострадавшие дети до 16 лет
  dtp_children_16 INTEGER DEFAULT 0,
  dtp_children_16_dead INTEGER DEFAULT 0,
  dtp_children_16_injured INTEGER DEFAULT 0,

  -- ДТП из-за нарушения ПДД водителями
  dtp_drivers_violation INTEGER DEFAULT 0,
  dtp_drivers_violation_dead INTEGER DEFAULT 0,
  dtp_drivers_violation_injured INTEGER DEFAULT 0,

  -- ДТП из-за выезда на встречную полосу
  dtp_oncoming_lane INTEGER DEFAULT 0,
  dtp_oncoming_lane_dead INTEGER DEFAULT 0,
  dtp_oncoming_lane_injured INTEGER DEFAULT 0,

  -- ДТП и пострадавшие дети до 18 лет
  dtp_children_18 INTEGER DEFAULT 0,
  dtp_children_18_dead INTEGER DEFAULT 0,
  dtp_children_18_injured INTEGER DEFAULT 0,

  -- ДТП в населённых пунктах
  dtp_in_settlements INTEGER DEFAULT 0,
  dtp_in_settlements_dead INTEGER DEFAULT 0,
  dtp_in_settlements_injured INTEGER DEFAULT 0,

  -- ДТП на автодорогах общего пользования
  dtp_on_highways INTEGER DEFAULT 0,
  dtp_on_highways_dead INTEGER DEFAULT 0,
  dtp_on_highways_injured INTEGER DEFAULT 0,

  -- ДТП на железнодорожных переездах
  dtp_railway_crossings INTEGER DEFAULT 0,
  dtp_railway_crossings_dead INTEGER DEFAULT 0,
  dtp_railway_crossings_injured INTEGER DEFAULT 0,

  -- ДТП вне городов и населённых пунктов
  dtp_outside_settlements INTEGER DEFAULT 0,
  dtp_outside_settlements_dead INTEGER DEFAULT 0,
  dtp_outside_settlements_injured INTEGER DEFAULT 0,

  -- ДТП со скрывшимися ТС (всего)
  dtp_hit_and_run INTEGER DEFAULT 0,
  dtp_hit_and_run_dead INTEGER DEFAULT 0,
  dtp_hit_and_run_injured INTEGER DEFAULT 0,

  -- ДТП со скрывшимся водителем (ТС осталось)
  dtp_driver_fled INTEGER DEFAULT 0,
  dtp_driver_fled_dead INTEGER DEFAULT 0,
  dtp_driver_fled_injured INTEGER DEFAULT 0,

  -- ДТП с неустановленными ТС
  dtp_unknown_vehicle INTEGER DEFAULT 0,
  dtp_unknown_vehicle_dead INTEGER DEFAULT 0,
  dtp_unknown_vehicle_injured INTEGER DEFAULT 0,

  -- ДТП на участках с фотофиксацией
  dtp_photo_radar INTEGER DEFAULT 0,
  dtp_photo_radar_dead INTEGER DEFAULT 0,
  dtp_photo_radar_injured INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Unique constraint: one record per municipality per month
  UNIQUE(municipality_id, period)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_gibdd_data_period ON gibdd_data(period);
CREATE INDEX IF NOT EXISTS idx_gibdd_data_municipality ON gibdd_data(municipality_id);
CREATE INDEX IF NOT EXISTS idx_gibdd_data_municipality_period ON gibdd_data(municipality_id, period);

-- Comments
COMMENT ON TABLE gibdd_data IS 'Статистика ДТП от ГИБДД по муниципалитетам';
COMMENT ON COLUMN gibdd_data.period IS 'Период (месяц и год): YYYY-MM-01';
