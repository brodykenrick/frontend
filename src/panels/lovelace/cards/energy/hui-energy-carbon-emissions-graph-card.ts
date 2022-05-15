import { ChartData, ChartDataset, ChartOptions } from "chart.js";
import {
  addHours,
  differenceInDays,
  endOfToday,
  isToday,
  startOfToday,
} from "date-fns";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, CSSResultGroup, html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
/*
import {
  hex2rgb,
  lab2rgb,
  rgb2hex,
  rgb2lab,
} from "../../../../common/color/convert-color";
*/
// import { labBrighten, labDarken } from "../../../../common/color/lab";
import { formatTime } from "../../../../common/datetime/format_time";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import {
  formatNumber,
  numberFormatToLocale,
} from "../../../../common/number/format_number";
import "../../../../components/chart/ha-chart-base";
import "../../../../components/ha-card";
import { EnergyData, getEnergyDataCollection } from "../../../../data/energy";
import { FrontendLocaleData } from "../../../../data/translation";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import { HomeAssistant } from "../../../../types";
import { LovelaceCard } from "../../types";
import { EnergyCarbonEmissionsGraphCardConfig } from "../types";


@customElement("hui-energy-carbon-emissions-graph-card")
export class HuiEnergyCarbonEmissionsGraphCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: EnergyCarbonEmissionsGraphCardConfig;

  @state() private _chartData: ChartData = {
    datasets: [],
  };

  @state() private _start = startOfToday();

  @state() private _end = endOfToday();

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => this._getStatistics(data)),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  public setConfig(config: EnergyCarbonEmissionsGraphCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <ha-card>
        ${this._config.title
          ? html`<h1 class="card-header">${this._config.title}</h1>`
          : ""}
        <div
          class="content ${classMap({
            "has-header": !!this._config.title,
          })}"
        >
          <ha-chart-base
            .data=${this._chartData}
            .options=${this._createOptions(
              this._start,
              this._end,
              this.hass.locale
            )}
            chart-type="bar"
          ></ha-chart-base>
          ${!this._chartData.datasets.some((dataset) => dataset.data.length)
            ? html`<div class="no-data">
                ${isToday(this._start)
                  ? this.hass.localize("ui.panel.lovelace.cards.energy.no_data")
                  : this.hass.localize(
                      "ui.panel.lovelace.cards.energy.no_data_period"
                    )}
              </div>`
            : ""}
        </div>
      </ha-card>
    `;
  }

  private _createOptions = memoizeOne(
    (start: Date, end: Date, locale: FrontendLocaleData): ChartOptions => {
      const dayDifference = differenceInDays(end, start);
      return {
        parsing: false,
        animation: false,
        scales: {
          x: {
            type: "time",
            suggestedMin: start.getTime(),
            suggestedMax: end.getTime(),
            adapters: {
              date: {
                locale: locale,
              },
            },
            ticks: {
              maxRotation: 0,
              sampleSize: 5,
              autoSkipPadding: 20,
              major: {
                enabled: true,
              },
              font: (context) =>
                context.tick && context.tick.major
                  ? ({ weight: "bold" } as any)
                  : {},
            },
            time: {
              tooltipFormat:
                dayDifference > 35
                  ? "monthyear"
                  : dayDifference > 7
                  ? "date"
                  : dayDifference > 2
                  ? "weekday"
                  : dayDifference > 0
                  ? "datetime"
                  : "hour",
              minUnit:
                dayDifference > 35
                  ? "month"
                  : dayDifference > 2
                  ? "day"
                  : "hour",
            },
            offset: true,
          },
          y: {
            stacked: true,
            type: "linear",
            title: {
              display: true,
              text: "kgCO2Eq",
            },
            ticks: {
              beginAtZero: true,
              callback: (value) => formatNumber(Math.abs(value), locale),
            },
          },
        },
        plugins: {
          tooltip: {
            mode: "x",
            intersect: true,
            position: "nearest",
            filter: (val) => val.formattedValue !== "0",
            callbacks: {
              title: (datasets) => {
                if (dayDifference > 0) {
                  return datasets[0].label;
                }
                const date = new Date(datasets[0].parsed.x);
                return `${formatTime(date, locale)} – ${formatTime(
                  addHours(date, 1),
                  locale
                )}`;
              },
              label: (context) =>
                `${context.dataset.label}: ${formatNumber(
                  Math.abs(context.parsed.y),
                  locale
                )} kgCO2Eq`,
              footer: (contexts) => {
                let totalEmitted = 0;
                let totalOffsetAndAvoided = 0;
                for (const context of contexts) {
                  const value = (context.dataset.data[context.dataIndex] as any)
                    .y;
                  if (value > 0) {
                    totalEmitted += value;
                  } else {
                    totalOffsetAndAvoided += Math.abs(value);
                  }
                }
                return [
                  totalEmitted
                    ? this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.total_emitted",
                        { num: formatNumber(totalEmitted, locale) }
                      )
                    : "",
                  totalOffsetAndAvoided
                    ? this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.total_offset_and_avoided",
                        { num: formatNumber(totalOffsetAndAvoided, locale) }
                      )
                    : "",
                ].filter(Boolean);
              },
            },
          },
          filler: {
            propagate: false,
          },
          legend: {
            display: false,
            labels: {
              usePointStyle: true,
            },
          },
        },
        hover: {
          mode: "nearest",
        },
        elements: {
          bar: { borderWidth: 1.5, borderRadius: 4 },
          point: {
            hitRadius: 5,
          },
        },
        // @ts-expect-error
        locale: numberFormatToLocale(locale),
      };
    }
  );

  private async _getStatistics(energyData: EnergyData): Promise<void> {
    const datasets: ChartDataset<"bar">[] = [];


    const statistics: {
      to_grid?: string[];
      from_grid?: string[];
      from_gas?: string[];
    } = {};

    for (const source of energyData.prefs.energy_sources) {

      if (source.type !== "grid") {
        continue;
      }
      // TODO: Add in gas.....

      // grid source
      for (const flowFrom of source.flow_from) {
        if (statistics.from_grid) {
          statistics.from_grid.push(flowFrom.stat_energy_from);
        } else {
          statistics.from_grid = [flowFrom.stat_energy_from];
        }
      }
      for (const flowTo of source.flow_to) {
        if (statistics.to_grid) {
          statistics.to_grid.push(flowTo.stat_energy_to);
        } else {
          statistics.to_grid = [flowTo.stat_energy_to];
        }
      }
    }
    
    this._start = energyData.start;
    this._end = energyData.end || endOfToday();

    const combinedData: {
      to_grid?: { [statId: string]: { [start: string]: number } };
      from_grid?: { [statId: string]: { [start: string]: number } };
      from_gas?: { [statId: string]: { [start: string]: number } };

    } = {};

    const summedData: {
      to_grid?: { [start: string]: number };
      from_grid?: { [start: string]: number };
      from_gas?: { [start: string]: number };
    } = {};

    // eslint-disable-next-line no-console
    console.log({ combinedData });

    // eslint-disable-next-line no-console
    console.log({ summedData });

    const computedStyles = getComputedStyle(this);
    const colors = {
      emissions_electricity: computedStyles
        .getPropertyValue("--energy-carbon-emissions-electricity-color")
        .trim(),
      avoided_electricity: computedStyles
        .getPropertyValue("--energy-carbon-avoided-electricity-color")
        .trim(),
      offsets_electricity: computedStyles
        .getPropertyValue("--energy-carbon-offsets-electricity-color")
        .trim(),
      emissions_gas: computedStyles
        .getPropertyValue("--energy-carbon-emissions-gas-color")
        .trim(),
      offsets_gas: computedStyles
        .getPropertyValue("--energy-carbon-offsets-gas-color")
        .trim(),
    };
    const labels = {
      avoided_electricity: this.hass.localize(
        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.electricity_avoided"
      ),
      offsets_electricity: this.hass.localize(
        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.electricity_offsets"
      ),
      emissions_electricity: this.hass.localize(
        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.electricity_emissions"
      ),
      offsets_gas: this.hass.localize(
        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.gas_offsets"
      ),
      emissions_gas: this.hass.localize(
        "ui.panel.lovelace.cards.energy.energy_carbon_emissions_graph.gas_emissions"
      ),
    };


    let allSensorKeys: string[] = [];
    Object.values(energyData.emissions).forEach((emission) => {
        allSensorKeys = allSensorKeys.concat(Object.keys(emission));
    });
    const uniqueSensorKeys = Array.from(new Set(allSensorKeys));

    let allTimeKeys: string[] = [];
    Object.values(energyData.emissions).forEach((emission) => {
        for (const sensorKeySensor of uniqueSensorKeys) {
          if(emission[sensorKeySensor])
          {
            allTimeKeys = allTimeKeys.concat(Object.keys(emission[sensorKeySensor].carbonDioxideEquivalent));
          }
        }
    });
    const uniqueTimeKeys = Array.from(new Set(allTimeKeys));

    

    for (const sensorKeySensor of uniqueSensorKeys) {
      let borderColor = undefined;
      let labelText = undefined;
      let direction = 1.0;
      let carbonDioxideEquivalentEmissions = undefined;

      if(energyData.emissions.emission_array3_emissions[sensorKeySensor])
      {
        if(energyData.emissions.emission_array3_emissions[sensorKeySensor].type === "grid")
        {
          borderColor = colors.emissions_electricity;
          labelText = labels.emissions_electricity;
          carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_emissions[sensorKeySensor].carbonDioxideEquivalent;
        }
        else
        if(energyData.emissions.emission_array3_emissions[sensorKeySensor].type === "gas")
        {
          borderColor = colors.emissions_gas;
          labelText = labels.emissions_gas;
          carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_emissions[sensorKeySensor].carbonDioxideEquivalent;
        }
      }

      if( ! carbonDioxideEquivalentEmissions)
      {
        continue;
      }

      // Try to convert the emissions to the chart format here and push on to the datasets
      const data: ChartDataset<"bar">[] = [];

      const entity = this.hass.states[sensorKeySensor];
      const type = "this_will_fail_as_an_index";

      const labelTextAlt = type in labels
              ? labels[type]
              : entity
              ? computeStateName(entity)
              : sensorKeySensor;

      data.push({
        label: labelTextAlt,
        stack: "stack",
        backgroundColor: borderColor + "7F",
        data: [],
      });

      // Process chart data.
      for (const key of uniqueTimeKeys) {
        const value = carbonDioxideEquivalentEmissions[key] || 0;
        const date = new Date(key);
        // @ts-expect-error
        data[0].data.push({
          x: date.getTime(),
          y: direction * value
        });
      }
      Array.prototype.push.apply(datasets, data);
    }

    for (const sensorKeySensor of uniqueSensorKeys) {
      let borderColor = undefined;
      let labelText = undefined;
      let direction = 1.0;
      let carbonDioxideEquivalentEmissions = undefined;


      if(energyData.emissions.emission_array3_offsets[sensorKeySensor])
      {
        if(energyData.emissions.emission_array3_offsets[sensorKeySensor].type === "grid")
        {
          borderColor = colors.offsets_electricity;
          labelText = labels.offsets_electricity;
          direction = -1.0;
          carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_offsets[sensorKeySensor].carbonDioxideEquivalent;
        }
        else
        if(energyData.emissions.emission_array3_emissions[sensorKeySensor].type === "gas")
        {
          borderColor = colors.offsets_gas;
          labelText = labels.offsets_gas;
          direction = -1.0;
          carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_offsets[sensorKeySensor].carbonDioxideEquivalent;
        }
      }

      if( ! carbonDioxideEquivalentEmissions)
      {
        continue;
      }

      

      // Try to convert the emissions to the chart format here and push on to the datasets
      const data: ChartDataset<"bar">[] = [];

      const entity = this.hass.states[sensorKeySensor];
      const type = "this_will_fail_as_an_index";

      const labelTextAlt = type in labels
              ? labels[type]
              : entity
              ? computeStateName(entity)
              : sensorKeySensor;

      data.push({
        label: labelTextAlt,
        stack: "stack",
        backgroundColor: borderColor + "7F",
        data: [],
      });

      // Process chart data.
      for (const key of uniqueTimeKeys) {
        const value = carbonDioxideEquivalentEmissions[key] || 0;
        const date = new Date(key);
        // @ts-expect-error
        data[0].data.push({
          x: date.getTime(),
          y: direction * value
        });
      }
      Array.prototype.push.apply(datasets, data);
    }

    for (const sensorKeySensor of uniqueSensorKeys) {
      let borderColor = undefined;
      let labelText = undefined;
      let direction = 1.0;
      let carbonDioxideEquivalentEmissions = undefined;


    if(energyData.emissions.emission_array3_avoided[sensorKeySensor])
      {
      if(energyData.emissions.emission_array3_avoided[sensorKeySensor].type === "grid")
      {
        borderColor = colors.avoided_electricity;
        labelText = labels.avoided_electricity;
        direction = -1.0;
        carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_avoided[sensorKeySensor].carbonDioxideEquivalent;
      }
      else
      if(energyData.emissions.emission_array3_emissions[sensorKeySensor].type === "gas")
      {
        borderColor = colors.avoided_gas;
        labelText = labels.avoided_gas;
        direction = -1.0;
        carbonDioxideEquivalentEmissions = energyData.emissions.emission_array3_avoided[sensorKeySensor].carbonDioxideEquivalent;
      }
    }

    if( ! carbonDioxideEquivalentEmissions)
      {
        continue;
      }

      

      // Try to convert the emissions to the chart format here and push on to the datasets
      const data: ChartDataset<"bar">[] = [];


      // TODO: Handle dark mode still....


      const entity = this.hass.states[sensorKeySensor];
      const type = "this_will_fail_as_an_index";

      const labelTextAlt = type in labels
              ? labels[type]
              : entity
              ? computeStateName(entity)
              : sensorKeySensor;

      data.push({
        label: labelTextAlt,
        stack: "stack",
        backgroundColor: borderColor + "7F",
        data: [],
      });

      // Process chart data.
      for (const key of uniqueTimeKeys) {
        const value = carbonDioxideEquivalentEmissions[key] || 0;
        const date = new Date(key);
        // @ts-expect-error
        data[0].data.push({
          x: date.getTime(),
          y: direction * value
        });
      }
      Array.prototype.push.apply(datasets, data);
    }
  


    this._chartData = {
      datasets,
    };
  }

  static get styles(): CSSResultGroup {
    return css`
      ha-card {
        height: 100%;
      }
      .card-header {
        padding-bottom: 0;
      }
      .content {
        padding: 16px;
      }
      .has-header {
        padding-top: 0;
      }
      .no-data {
        position: absolute;
        height: 100%;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20%;
        margin-left: 32px;
        box-sizing: border-box;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-energy-carbon-emissions-graph-card": HuiEnergyCarbonEmissionsGraphCard;
  }
}
