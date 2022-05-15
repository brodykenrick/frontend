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
// import { computeStateName } from "../../../../common/entity/compute_state_name";
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

    
    this._start = energyData.start;
    this._end = energyData.end || endOfToday();


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


    const carbonDioxideEquivalentElectricityEmissions = energyData.emissions.emission_array[0].carbonDioxideEquivalent;
    const carbonDioxideEquivalentElectricityAvoided = energyData.emissions.emission_array[1].carbonDioxideEquivalent;
    const carbonDioxideEquivalentElectricityOffsets = energyData.emissions.emission_array[2].carbonDioxideEquivalent;
    const carbonDioxideEquivalentGasEmissions = energyData.emissions.emission_array[3].carbonDioxideEquivalent;
    const carbonDioxideEquivalentGasOffsets = energyData.emissions.emission_array[4].carbonDioxideEquivalent;

    // TODO: Move this to an array to loop over (need to capture the sign of the carbon also in that)
    let allKeys: string[] = [];
    Object.values(energyData.emissions.emission_array).forEach((emission) => {
        allKeys = allKeys.concat(Object.keys(emission.carbonDioxideEquivalent));
    });
    const uniqueKeys = Array.from(new Set(allKeys));

 


  

    // Not supporting dark mode as yet...... see usage graphs
    let borderColor = colors.emissions_electricity;
    let labelText = labels.emissions_electricity;

    // Try to convert the emissions to the chart format here and push on to the datasets
    const dataEE: ChartDataset<"bar">[] = [];
    dataEE.push({
      label: labelText,
      stack: "stack",
      backgroundColor: borderColor + "7F",
      data: [],
    });

    // Process chart data.
    for (const key of uniqueKeys) {
      const value = carbonDioxideEquivalentElectricityEmissions[key] || 0;
      const date = new Date(key);
      // @ts-expect-error
      dataEE[0].data.push({
        x: date.getTime(),
        y: +1 * value
      });
    }
    Array.prototype.push.apply(datasets, dataEE);


    borderColor = colors.offsets_electricity;
    labelText = labels.offsets_electricity;

    const dataEO: ChartDataset<"bar">[] = [];
    dataEO.push({
      label: labelText,
      stack: "stack",
      backgroundColor: borderColor + "7F",
      data: [],
    });

    // Process chart data.
    for (const key of uniqueKeys) {
      const value = carbonDioxideEquivalentElectricityOffsets[key] || 0;
      const date = new Date(key);
      // @ts-expect-error
      dataEO[0].data.push({
        x: date.getTime(),
        y: -1 * value
      });
    }
    Array.prototype.push.apply(datasets, dataEO);


    borderColor = colors.avoided_electricity;
    labelText = labels.avoided_electricity;

    const dataEA: ChartDataset<"bar">[] = [];
    dataEA.push({
      label: labelText,
      stack: "stack",
      backgroundColor: borderColor + "7F",
      data: [],
    });

    // Process chart data.
    for (const key of uniqueKeys) {
      const value = carbonDioxideEquivalentElectricityAvoided[key] || 0;
      const date = new Date(key);
      // @ts-expect-error
      dataEA[0].data.push({
        x: date.getTime(),
        y: -1 * value
      });
    }
    Array.prototype.push.apply(datasets, dataEA);




    // Gas
    borderColor = colors.emissions_gas;
    labelText = labels.emissions_gas;

    // Try to convert the emissions to the chart format here and push on to the datasets
    const dataGE: ChartDataset<"bar">[] = [];
    dataGE.push({
      label: labelText,
      stack: "stack",
      backgroundColor: borderColor + "7F",
      data: [],
    });

    // Process chart data.
    for (const key of uniqueKeys) {
      const value = carbonDioxideEquivalentGasEmissions[key] || 0;
      const date = new Date(key);
      // @ts-expect-error
      dataGE[0].data.push({
        x: date.getTime(),
        y: +1 * value
      });
    }
    Array.prototype.push.apply(datasets, dataGE);


    borderColor = colors.offsets_gas;
    labelText = labels.offsets_gas;

    const dataGO: ChartDataset<"bar">[] = [];
    dataGO.push({
      label: labelText,
      stack: "stack",
      backgroundColor: borderColor + "7F",
      data: [],
    });

    // Process chart data.
    for (const key of uniqueKeys) {
      const value = carbonDioxideEquivalentGasOffsets[key] || 0;
      const date = new Date(key);
      // @ts-expect-error
      dataGO[0].data.push({
        x: date.getTime(),
        y: -1 * value
      });
    }
    Array.prototype.push.apply(datasets, dataGO);



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
