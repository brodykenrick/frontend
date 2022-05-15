import {
  addHours,
  differenceInDays,
  endOfToday,
  endOfYesterday,
  startOfToday,
  startOfYesterday,
} from "date-fns";
import { Collection, getCollection } from "home-assistant-js-websocket";
import { groupBy } from "../common/util/group-by";
import { subscribeOne } from "../common/util/subscribe-one";
import { HomeAssistant } from "../types";
import { ConfigEntry, getConfigEntries } from "./config_entries";
import { subscribeEntityRegistry } from "./entity_registry";
import {
  fetchStatistics,
  Statistics,
  StatisticsMetaData,
  getStatisticMetadata,
} from "./history";

const energyCollectionKeys: (string | undefined)[] = [];

export const emptyFlowFromGridSourceEnergyPreference =
  (): FlowFromGridSourceEnergyPreference => ({
    stat_energy_from: "",
    stat_cost: null,
    entity_energy_from: null,
    entity_energy_price: null,
    number_energy_price: null,
    number_offset_percentage: null,
  });

export const emptyFlowToGridSourceEnergyPreference =
  (): FlowToGridSourceEnergyPreference => ({
    stat_energy_to: "",
    stat_compensation: null,
    entity_energy_to: null,
    entity_energy_price: null,
    number_energy_price: null,
    number_offset_percentage: null, // TODO - Remove...
  });

export const emptyGridSourceEnergyPreference =
  (): GridSourceTypeEnergyPreference => ({
    type: "grid",
    flow_from: [],
    flow_to: [],
    cost_adjustment_day: 0,
  });

export const emptySolarEnergyPreference =
  (): SolarSourceTypeEnergyPreference => ({
    type: "solar",
    stat_energy_from: "",
    config_entry_solar_forecast: null,
  });

export const emptyBatteryEnergyPreference =
  (): BatterySourceTypeEnergyPreference => ({
    type: "battery",
    stat_energy_from: "",
    stat_energy_to: "",
  });
export const emptyGasEnergyPreference = (): GasSourceTypeEnergyPreference => ({
  type: "gas",
  stat_energy_from: "",
  stat_cost: null,
  entity_energy_from: null,
  entity_energy_price: null,
  number_energy_price: null,
});

interface EnergySolarForecast {
  wh_hours: Record<string, number>;
}
export type EnergySolarForecasts = {
  [config_entry_id: string]: EnergySolarForecast;
};

export interface DeviceConsumptionEnergyPreference {
  // This is an ever increasing value
  stat_consumption: string;
}

export interface FlowFromGridSourceEnergyPreference {
  // kWh meter
  stat_energy_from: string;

  // $ meter
  stat_cost: string | null;

  // Can be used to generate costs if stat_cost omitted
  entity_energy_from: string | null;
  entity_energy_price: string | null;
  number_energy_price: number | null;

  number_offset_percentage: number | null;
}

export interface FlowToGridSourceEnergyPreference {
  // kWh meter
  stat_energy_to: string;

  // $ meter
  stat_compensation: string | null;

  // Can be used to generate costs if stat_cost omitted
  entity_energy_to: string | null;
  entity_energy_price: string | null;
  number_energy_price: number | null;

  number_offset_percentage: number | null; // TODO Remove this....
}

export interface GridSourceTypeEnergyPreference {
  type: "grid";

  flow_from: FlowFromGridSourceEnergyPreference[];
  flow_to: FlowToGridSourceEnergyPreference[];

  cost_adjustment_day: number;
}

export interface SolarSourceTypeEnergyPreference {
  type: "solar";

  stat_energy_from: string;
  config_entry_solar_forecast: string[] | null;
}

export interface BatterySourceTypeEnergyPreference {
  type: "battery";
  stat_energy_from: string;
  stat_energy_to: string;
}
export interface GasSourceTypeEnergyPreference {
  type: "gas";

  // kWh meter
  stat_energy_from: string;

  // $ meter
  stat_cost: string | null;

  // Can be used to generate costs if stat_cost omitted
  entity_energy_from: string | null;
  entity_energy_price: string | null;
  number_energy_price: number | null;
  unit_of_measurement?: string | null;
}

type EnergySource =
  | SolarSourceTypeEnergyPreference
  | GridSourceTypeEnergyPreference
  | BatterySourceTypeEnergyPreference
  | GasSourceTypeEnergyPreference;

export interface EnergyPreferences {
  energy_sources: EnergySource[];
  device_consumption: DeviceConsumptionEnergyPreference[];
}

export interface EnergyInfo {
  cost_sensors: Record<string, string>;
  solar_forecast_domains: string[];
}

export interface EnergyValidationIssue {
  type: string;
  identifier: string;
  value?: unknown;
}

export interface EnergyPreferencesValidation {
  energy_sources: EnergyValidationIssue[][];
  device_consumption: EnergyValidationIssue[][];
}

export const getEnergyInfo = (hass: HomeAssistant) =>
  hass.callWS<EnergyInfo>({
    type: "energy/info",
  });

export const getEnergyPreferenceValidation = (hass: HomeAssistant) =>
  hass.callWS<EnergyPreferencesValidation>({
    type: "energy/validate",
  });

export const getEnergyPreferences = (hass: HomeAssistant) =>
  hass.callWS<EnergyPreferences>({
    type: "energy/get_prefs",
  });

export const saveEnergyPreferences = async (
  hass: HomeAssistant,
  prefs: Partial<EnergyPreferences>
) => {
  const newPrefs = hass.callWS<EnergyPreferences>({
    type: "energy/save_prefs",
    ...prefs,
  });
  clearEnergyCollectionPreferences(hass);
  return newPrefs;
};

export interface FossilEnergyConsumption {
  [date: string]: number;
}

export const getFossilEnergyConsumption = async (
  hass: HomeAssistant,
  startTime: Date,
  energy_statistic_ids: string[],
  co2_statistic_id: string,
  co2_offset_factor: number,
  endTime?: Date,
  period: "5minute" | "hour" | "day" | "month" = "hour"
) =>
  hass.callWS<FossilEnergyConsumption>({
    type: "energy/fossil_energy_consumption",
    start_time: startTime.toISOString(),
    end_time: endTime?.toISOString(),
    energy_statistic_ids,
    co2_statistic_id,
    co2_offset_factor,
    period,
  });

  

  export interface CarbonDioxideEquivalent {
    [date: string]: number;
  }


  export interface ElectricityCarbonDioxideEquivalent {
    type: "grid";
    kind: "emissions" | "offsets" | "avoided";
    isEmission: boolean;
  
    carbonDioxideEquivalent: CarbonDioxideEquivalent;
  }

  export interface GasCarbonDioxideEquivalent {
    type: "gas";
    kind: "emissions" | "offsets" | "avoided";
    isEmission: boolean;
  
    carbonDioxideEquivalent: CarbonDioxideEquivalent;
  }
  

  export type CarbonDioxideEquivalent_Emission =
  | ElectricityCarbonDioxideEquivalent
  | GasCarbonDioxideEquivalent;

  export const sumEmissions = ( carbonDioxideEquivalent_Emission: CarbonDioxideEquivalent_Emission ) => 
     ( carbonDioxideEquivalent_Emission ?
    (carbonDioxideEquivalent_Emission.isEmission ? 1.0 : -1.0) *
     (
        carbonDioxideEquivalent_Emission.carbonDioxideEquivalent ?
        Object.values(carbonDioxideEquivalent_Emission.carbonDioxideEquivalent).reduce(
          (sum, a) => sum + a,
          0
        )
      : 0)
      :0
     );
  


  
  export const getCarbonDioxideEquivalent = async (
    hass: HomeAssistant,
    startTime: Date,
    energy_statistic_ids: string[],
    co2_statistic_id: string,
    co2_intensity_default: number,
    co2_offset_factor: number,
    endTime?: Date,
    period: "5minute" | "hour" | "day" | "month" = "hour"
  ) =>
    hass.callWS<CarbonDioxideEquivalent>({
      type: "energy/carbon_dioxide_equivalent",
      start_time: startTime.toISOString(),
      end_time: endTime?.toISOString(),
      energy_statistic_ids,
      co2_statistic_id,
      co2_intensity_default,
      co2_offset_factor,
      period,
    });

interface IDictionary {
  [statisticId: string]: CarbonDioxideEquivalent_Emission[];
}


// Probably want a type (gas, grid/electricity) and another type for the kind of emission (emitted, avoided, offset)
export interface Emissions {
  emission_array3_emissions: IDictionary;
  emission_array3_offsets: IDictionary;
  emission_array3_avoided: IDictionary;
}



interface EnergySourceByType {
  grid?: GridSourceTypeEnergyPreference[];
  solar?: SolarSourceTypeEnergyPreference[];
  battery?: BatterySourceTypeEnergyPreference[];
  gas?: GasSourceTypeEnergyPreference[];
}

export const energySourcesByType = (prefs: EnergyPreferences) =>
  groupBy(prefs.energy_sources, (item) => item.type) as EnergySourceByType;


export interface EnergyData {
  start: Date;
  end?: Date;
  prefs: EnergyPreferences;
  info: EnergyInfo;
  stats: Statistics;
  co2SignalConfigEntry?: ConfigEntry;
  co2SignalEntity?: string;

  // TODO - BK? Why would these be here and not included in the stats? What is special about fossilEnergy (and are emissions special also?)
  fossilEnergyConsumption?: FossilEnergyConsumption;
  emissions?: Emissions;
}




const getEnergyData = async (
  hass: HomeAssistant,
  prefs: EnergyPreferences,
  start: Date,
  end?: Date
): Promise<EnergyData> => {
  const [configEntries, entityRegistryEntries, info] = await Promise.all([
    getConfigEntries(hass, { domain: "co2signal" }),
    subscribeOne(hass.connection, subscribeEntityRegistry),
    getEnergyInfo(hass),
  ]);

  // TODO - This is something to rework a little (as input and output can be different)
  // I don't think CO2signal is easy to distinguish programattically what the intensity of "just green" is

  // OK, weird -- we just look up the first entry if any exist...
  const co2SignalConfigEntry = configEntries.length
    ? configEntries[0]
    : undefined;

  // Percent that is fossil/high-cabon vs renewable/green
  let co2SignalEntityGridPercentageFossil: string | undefined;
  // A grid intensity (g / kWh) measure it track emissions from imports and avoided emissions from exports
  // Note: Input and output can be different in affect if you purchase "guraranteed renewables" (only from renewable sources/battery - i.e. absolute zero)
  // If you are using an offset mechanism like green power (that takes from teh grid but offset used energy to be net-zero)
  let co2SignalEntityGridIntensity: string | undefined;


  if (co2SignalConfigEntry) {
    for (const entry of entityRegistryEntries) {
      if (entry.config_entry_id !== co2SignalConfigEntry.entry_id) {
        continue;
      }

      const co2State = hass.states[entry.entity_id];
      if (!co2State) {
        continue;
      }
      if (co2State.attributes.unit_of_measurement === "%") {
        co2SignalEntityGridPercentageFossil = co2State.entity_id;
        continue;
      }
      if (co2State.attributes.unit_of_measurement === "gCO2eq/kWh") {
        co2SignalEntityGridIntensity = co2State.entity_id;
        continue;
      }
    }
  }

  const dayDifference = differenceInDays(end || new Date(), start);

  interface IDictionary {
    [statisticId: string]: CarbonDioxideEquivalent_Emission[];
  }
  const emission_array3_emissions = {} as IDictionary;
  const emission_array3_offsets = {} as IDictionary;
  const emission_array3_avoided = {} as IDictionary;



  // TODO: Move this to config in UI
  let co2_import_electricity_offset_factor = 1.0; // Percentage of non-fossil fuels you import and offset (i.e. GreenPower at 100% is a complete offset)
  const co2_import_gas_offset_factor = 0.00; // TODO: Rework this as it will be settable by some....

  // TODO Fix this to get from tehe correct data
  const offset = prefs.energy_sources[0].flow_from[0].number_offset_percentage


  co2_import_electricity_offset_factor = offset / 100.0


  const gridConsumptionStatIDs: string[] = [];
  const gridReturnStatIDs: string[] = [];
  const gasConsumptionStatIDs: string[] = [];

  

  const statIDs: string[] = [];
  const gasSources: GasSourceTypeEnergyPreference[] =
    prefs.energy_sources.filter(
      (source) => source.type === "gas"
    ) as GasSourceTypeEnergyPreference[];
  const gasStatisticIdsWithMeta: StatisticsMetaData[] =
    await getStatisticMetadata(
      hass,
      gasSources.map((source) => source.stat_energy_from)
    );

  for (const source of prefs.energy_sources) {
    if (source.type === "solar") {
      statIDs.push(source.stat_energy_from);
      continue;
    }

    if (source.type === "gas") {
      gasConsumptionStatIDs.push(source.stat_energy_from);
      
      // eslint-disable-next-line no-await-in-loop
      let carbonDioxideEquivalentTemp = await getCarbonDioxideEquivalent(
        hass!,
        start,
        gasConsumptionStatIDs,
        co2SignalEntityGridIntensity,
        500,
        1.0, // Actual emissions
        end,
        dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
      );
      const carbonDioxideEquivalentGasEmissions = {} as  GasCarbonDioxideEquivalent;
  
      carbonDioxideEquivalentGasEmissions.isEmission = true;
      carbonDioxideEquivalentGasEmissions.carbonDioxideEquivalent = carbonDioxideEquivalentTemp;
      carbonDioxideEquivalentGasEmissions.type = "gas";
      carbonDioxideEquivalentGasEmissions.kind = "emissions";
      emission_array3_emissions[ source.stat_energy_from ] = carbonDioxideEquivalentGasEmissions;

      // eslint-disable-next-line no-await-in-loop
      carbonDioxideEquivalentTemp = await getCarbonDioxideEquivalent(
        hass!,
        start,
        gasConsumptionStatIDs,
        co2SignalEntityGridIntensity,
        500,
        co2_import_gas_offset_factor,
        end,
        dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
      );
      const carbonDioxideEquivalentGasOffsets = {} as  GasCarbonDioxideEquivalent;
    
      carbonDioxideEquivalentGasOffsets.isEmission = false;
      carbonDioxideEquivalentGasOffsets.carbonDioxideEquivalent = carbonDioxideEquivalentTemp;
      carbonDioxideEquivalentGasOffsets.type = "gas";
      carbonDioxideEquivalentGasOffsets.kind = "offsets";
      emission_array3_offsets[ source.stat_energy_from ] = carbonDioxideEquivalentGasOffsets;


      statIDs.push(source.stat_energy_from);
      const entity = hass.states[source.stat_energy_from];
      if (!entity) {
        for (const statisticIdWithMeta of gasStatisticIdsWithMeta) {
          if (
            statisticIdWithMeta?.statistic_id === source.stat_energy_from &&
            statisticIdWithMeta?.unit_of_measurement
          ) {
            source.unit_of_measurement =
              statisticIdWithMeta?.unit_of_measurement === "Wh"
                ? "kWh"
                : statisticIdWithMeta?.unit_of_measurement;
          }
        }
      }
      if (source.stat_cost) {
        statIDs.push(source.stat_cost);
      }
      const costStatId = info.cost_sensors[source.stat_energy_from];
      if (costStatId) {
        statIDs.push(costStatId);
      }
      continue;
    }

    if (source.type === "battery") {
      statIDs.push(source.stat_energy_from);
      statIDs.push(source.stat_energy_to);
      continue;
    }

    // grid source
    for (const flowFrom of source.flow_from) {
      gridConsumptionStatIDs.push(flowFrom.stat_energy_from);

      /// TODO: Come back to optimise this....
      // eslint-disable-next-line no-await-in-loop
      let carbonDioxideEquivalentTemp = await getCarbonDioxideEquivalent(
        hass!,
        start,
        gridConsumptionStatIDs,
        co2SignalEntityGridIntensity,
        600, // Default CO2equiv intensity TODO - Make this configurable
        1.0, // Actual emissions
        end,
        dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
      );
      const carbonDioxideEquivalentElectricityEmissions = {} as  ElectricityCarbonDioxideEquivalent;
      carbonDioxideEquivalentElectricityEmissions.isEmission = true;
      carbonDioxideEquivalentElectricityEmissions.carbonDioxideEquivalent = carbonDioxideEquivalentTemp;
      carbonDioxideEquivalentElectricityEmissions.type = "grid";
      carbonDioxideEquivalentElectricityEmissions.kind = "emissions";
  
      emission_array3_emissions[ flowFrom.stat_energy_from ] = carbonDioxideEquivalentElectricityEmissions;



      // eslint-disable-next-line no-await-in-loop
      carbonDioxideEquivalentTemp = await getCarbonDioxideEquivalent(
        hass!,
        start,
        gridConsumptionStatIDs,
        co2SignalEntityGridIntensity,
        600,
        co2_import_electricity_offset_factor,
        end,
        dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
      );
      const carbonDioxideEquivalentElectricityOffsets = {} as  ElectricityCarbonDioxideEquivalent;
    
      carbonDioxideEquivalentElectricityOffsets.isEmission = false;
      carbonDioxideEquivalentElectricityOffsets.carbonDioxideEquivalent = carbonDioxideEquivalentTemp;
      carbonDioxideEquivalentElectricityOffsets.type = "grid";
      carbonDioxideEquivalentElectricityOffsets.kind = "offsets";

      emission_array3_offsets[ flowFrom.stat_energy_from ] = carbonDioxideEquivalentElectricityOffsets;


      //// yyyy
      
      statIDs.push(flowFrom.stat_energy_from);
      if (flowFrom.stat_cost) {
        statIDs.push(flowFrom.stat_cost);
      }
      const costStatId = info.cost_sensors[flowFrom.stat_energy_from];
      if (costStatId) {
        statIDs.push(costStatId);
      }
    }
    for (const flowTo of source.flow_to) {
      gridReturnStatIDs.push(flowTo.stat_energy_to);

      // eslint-disable-next-line no-await-in-loop
      const carbonDioxideEquivalentTemp = await getCarbonDioxideEquivalent(
        hass!,
        start,
        gridReturnStatIDs,
        co2SignalEntityGridIntensity,
        600,
        1.0,
        end,
        dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
      );
      const carbonDioxideEquivalentElectricityAvoided = {} as  ElectricityCarbonDioxideEquivalent;
  
      carbonDioxideEquivalentElectricityAvoided.isEmission = false;
      carbonDioxideEquivalentElectricityAvoided.carbonDioxideEquivalent = carbonDioxideEquivalentTemp;
      carbonDioxideEquivalentElectricityAvoided.type = "grid";
      carbonDioxideEquivalentElectricityAvoided.kind = "avoided";
      emission_array3_avoided[ flowTo.stat_energy_to ] = carbonDioxideEquivalentElectricityAvoided;


      statIDs.push(flowTo.stat_energy_to);
      if (flowTo.stat_compensation) {
        statIDs.push(flowTo.stat_compensation);
      }
      const costStatId = info.cost_sensors[flowTo.stat_energy_to];
      if (costStatId) {
        statIDs.push(costStatId);
      }
    }
  }

  

  // Subtract 1 hour from start to get starting point data
  const startMinHour = addHours(start, -1);

  const stats = await fetchStatistics(
    hass!,
    startMinHour,
    end,
    statIDs,
    dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
  );

  let fossilEnergyConsumption: FossilEnergyConsumption | undefined;



 

  // TODO: Work out how Fossil Energy deals with gas.... oh, it ignores it.....
  // Consider renaming this to just be grid fossil consumption (that is what the graphic shows so I guess it makes sense.......)
  if (co2SignalEntityGridPercentageFossil !== undefined) {
    fossilEnergyConsumption = await getFossilEnergyConsumption(
      hass!,
      start,
      gridConsumptionStatIDs, 
      co2SignalEntityGridPercentageFossil,
      co2_import_electricity_offset_factor,
      end,
      dayDifference > 35 ? "month" : dayDifference > 2 ? "day" : "hour"
    );
}




  Object.values(stats).forEach((stat) => {
    // if the start of the first value is after the requested period, we have the first data point, and should add a zero point
    if (stat.length && new Date(stat[0].start) > startMinHour) {
      stat.unshift({
        ...stat[0],
        start: startMinHour.toISOString(),
        end: startMinHour.toISOString(),
        sum: 0,
        state: 0,
      });
    }
  });

 
  const emissions = {
    emission_array3_emissions: emission_array3_emissions,
    emission_array3_offsets: emission_array3_offsets,
    emission_array3_avoided: emission_array3_avoided,
  };

  // eslint-disable-next-line no-console
  console.log({ emissions });



  const data = {
    start,
    end,
    info,
    prefs,
    stats,
    co2SignalConfigEntry,
    co2SignalEntity: co2SignalEntityGridPercentageFossil,
    fossilEnergyConsumption,
    emissions
  };

  return data;
};

export interface EnergyCollection extends Collection<EnergyData> {
  start: Date;
  end?: Date;
  prefs?: EnergyPreferences;
  clearPrefs(): void;
  setPeriod(newStart: Date, newEnd?: Date): void;
  _refreshTimeout?: number;
  _updatePeriodTimeout?: number;
  _active: number;
}

const clearEnergyCollectionPreferences = (hass: HomeAssistant) => {
  energyCollectionKeys.forEach((key) => {
    const energyCollection = getEnergyDataCollection(hass, { key });
    energyCollection.clearPrefs();
    if (energyCollection._active) {
      energyCollection.refresh();
    }
  });
};

export const getEnergyDataCollection = (
  hass: HomeAssistant,
  options: { prefs?: EnergyPreferences; key?: string } = {}
): EnergyCollection => {
  let key = "_energy";
  if (options.key) {
    if (!options.key.startsWith("energy_")) {
      throw new Error("Key need to start with energy_");
    }
    key = `_${options.key}`;
  }

  if ((hass.connection as any)[key]) {
    return (hass.connection as any)[key];
  }

  energyCollectionKeys.push(options.key);

  const collection = getCollection<EnergyData>(
    hass.connection,
    key,
    async () => {
      if (!collection.prefs) {
        // This will raise if not found.
        // Detect by checking `e.code === "not_found"
        collection.prefs = await getEnergyPreferences(hass);
      }

      if (collection._refreshTimeout) {
        clearTimeout(collection._refreshTimeout);
      }

      if (
        collection._active &&
        (!collection.end || collection.end > new Date())
      ) {
        // The stats are created every hour
        // Schedule a refresh for 20 minutes past the hour
        // If the end is larger than the current time.
        const nextFetch = new Date();
        if (nextFetch.getMinutes() >= 20) {
          nextFetch.setHours(nextFetch.getHours() + 1);
        }
        nextFetch.setMinutes(20, 0, 0);

        collection._refreshTimeout = window.setTimeout(
          () => collection.refresh(),
          nextFetch.getTime() - Date.now()
        );
      }

      return getEnergyData(
        hass,
        collection.prefs,
        collection.start,
        collection.end
      );
    }
  ) as EnergyCollection;

  const origSubscribe = collection.subscribe;

  collection.subscribe = (subscriber: (data: EnergyData) => void) => {
    const unsub = origSubscribe(subscriber);
    collection._active++;
    return () => {
      collection._active--;
      if (collection._active < 1) {
        clearTimeout(collection._refreshTimeout);
        collection._refreshTimeout = undefined;
      }
      unsub();
    };
  };

  collection._active = 0;
  collection.prefs = options.prefs;
  const now = new Date();
  // Set start to start of today if we have data for today, otherwise yesterday
  collection.start = now.getHours() > 0 ? startOfToday() : startOfYesterday();
  collection.end = now.getHours() > 0 ? endOfToday() : endOfYesterday();

  const scheduleUpdatePeriod = () => {
    collection._updatePeriodTimeout = window.setTimeout(
      () => {
        collection.start = startOfToday();
        collection.end = endOfToday();
        scheduleUpdatePeriod();
      },
      addHours(endOfToday(), 1).getTime() - Date.now() // Switch to next day an hour after the day changed
    );
  };
  scheduleUpdatePeriod();

  collection.clearPrefs = () => {
    collection.prefs = undefined;
  };
  collection.setPeriod = (newStart: Date, newEnd?: Date) => {
    collection.start = newStart;
    collection.end = newEnd;
    if (
      collection.start.getTime() === startOfToday().getTime() &&
      collection.end?.getTime() === endOfToday().getTime() &&
      !collection._updatePeriodTimeout
    ) {
      scheduleUpdatePeriod();
    } else if (collection._updatePeriodTimeout) {
      clearTimeout(collection._updatePeriodTimeout);
      collection._updatePeriodTimeout = undefined;
    }
  };
  return collection;
};

export const getEnergySolarForecasts = (hass: HomeAssistant) =>
  hass.callWS<EnergySolarForecasts>({
    type: "energy/solar_forecast",
  });

export const ENERGY_GAS_VOLUME_UNITS = ["m³", "ft³"];
export const ENERGY_GAS_ENERGY_UNITS = ["kWh"];
export const ENERGY_GAS_UNITS = [
  ...ENERGY_GAS_VOLUME_UNITS,
  ...ENERGY_GAS_ENERGY_UNITS,
];

export type EnergyGasUnit = "volume" | "energy";

export const getEnergyGasUnitCategory = (
  hass: HomeAssistant,
  prefs: EnergyPreferences
): EnergyGasUnit | undefined => {
  for (const source of prefs.energy_sources) {
    if (source.type !== "gas") {
      continue;
    }

    const entity = hass.states[source.stat_energy_from];
    if (entity) {
      return ENERGY_GAS_VOLUME_UNITS.includes(
        entity.attributes.unit_of_measurement!
      )
        ? "volume"
        : "energy";
    }
  }
  return undefined;
};

export const getEnergyGasUnit = (
  hass: HomeAssistant,
  prefs: EnergyPreferences
): string | undefined => {
  for (const source of prefs.energy_sources) {
    if (source.type !== "gas") {
      continue;
    }

    const entity = hass.states[source.stat_energy_from];
    if (entity?.attributes.unit_of_measurement) {
      // Wh is normalized to kWh by stats generation
      return entity.attributes.unit_of_measurement === "Wh"
        ? "kWh"
        : entity.attributes.unit_of_measurement;
    }
    if (source.unit_of_measurement) {
      return source.unit_of_measurement;
    }
  }
  return undefined;
};
