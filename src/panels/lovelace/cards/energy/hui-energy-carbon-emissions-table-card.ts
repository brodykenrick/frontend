// @ts-ignore
import dataTableStyles from "@material/data-table/dist/mdc.data-table.min.css";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  css,
  CSSResultGroup,
  html,
  LitElement,
  TemplateResult,
  unsafeCSS,
} from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import {
  rgb2hex,
  lab2rgb,
  rgb2lab,
  hex2rgb,
} from "../../../../common/color/convert-color";
import { labBrighten, labDarken } from "../../../../common/color/lab";
import { computeStateName } from "../../../../common/entity/compute_state_name";
import { formatNumber } from "../../../../common/number/format_number";
import "../../../../components/chart/statistics-chart";
import "../../../../components/ha-card";
import {
  CarbonDioxideEquivalent,
  CarbonDioxideEquivalent_Emission,
  EnergyData,
  energySourcesByType,
  getEnergyDataCollection,
  getEnergyGasUnit,
  sumEmissions,
} from "../../../../data/energy";
import { calculateStatisticSumGrowth } from "../../../../data/history";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import { HomeAssistant } from "../../../../types";
import { LovelaceCard } from "../../types";
import { EnergyCarbonEmissionsTableCardConfig } from "../types";

@customElement("hui-energy-carbon-emissions-table-card")
export class HuiEnergyCarbonEmissionsTableCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: EnergyCarbonEmissionsTableCardConfig;

  @state() private _data?: EnergyData;

  protected hassSubscribeRequiredHostProps = ["_config"];

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => {
        this._data = data;
      }),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  public setConfig(config: EnergyCarbonEmissionsTableCardConfig): void {
    this._config = config;
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    if (!this._data) {
      return html`${this.hass.localize(
        "ui.panel.lovelace.cards.energy.loading"
      )}`;
    }

    let netEmissions = 0;
    let absoluteEmissions = 0;

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
 


    // TODO: Move this to an array to loop over (need to capture the sign of the carbon also in that)


    // Not supporting dark mode as yet...... see usage graphs
    const borderColorEmissionsElectricity = colors.emissions_electricity;
    const borderColorOffsetsElectricity = colors.offsets_electricity;
    const borderColorAvoidedElectricity = colors.avoided_electricity;
    const borderColorEmissionsGas = colors.emissions_gas;
    const borderColorOffsetsGas = colors.offsets_gas;
   
    let electricityEmissions = 0;
    let electricityOffsets = 0;
    let electricityAvoided = 0;
    let gasEmissions = 0;
    let gasOffsets = 0;
    let gasAvoided = 0;

    let allKeys: string[] = [];
    Object.values(this._data.emissions).forEach((emission) => {
        allKeys = allKeys.concat(Object.keys(emission));
    });
    const uniqueKeys = Array.from(new Set(allKeys));

    // eslint-disable-next-line no-console
    console.log({uniqueKeys});

    for (const key of uniqueKeys) {

      if( this._data.emissions.emission_array3_emissions[key])
      {
        const tempE = sumEmissions( this._data.emissions.emission_array3_emissions[key] );
        if(this._data.emissions.emission_array3_emissions[key].type === "grid")
        {
          electricityEmissions += tempE;
        }
        else
        if(this._data.emissions.emission_array3_emissions[key].type === "gas")
        {
          gasEmissions += tempE;
        }
        netEmissions += tempE;
        absoluteEmissions += tempE;
      }

      if( this._data.emissions.emission_array3_offsets[key])
      {
        const tempO = sumEmissions( this._data.emissions.emission_array3_offsets[key] );
        if(this._data.emissions.emission_array3_offsets[key].type === "grid")
        {
          electricityOffsets += tempO;
        }
        else
        if(this._data.emissions.emission_array3_offsets[key].type === "gas")
        {
          gasOffsets += tempO;
        }
        netEmissions += tempO;
      }

      if( this._data.emissions.emission_array3_avoided[key])
      {
        const tempA = sumEmissions( this._data.emissions.emission_array3_avoided[key] );
        if(this._data.emissions.emission_array3_avoided[key].type === "grid")
        {
          electricityAvoided += tempA;
        }
        else
        if(this._data.emissions.emission_array3_avoided[key].type === "gas")
        {
          gasAvoided += tempA;
        }
        netEmissions += tempA;
      }
    }

    // eslint-disable-next-line no-console
    console.log({netEmissions});

    // eslint-disable-next-line no-console
    console.log({absoluteEmissions});

    const data = this._data;
    // eslint-disable-next-line no-console
    console.log({ data });

    // TODO: Get this more elegantly...
    const data_offset = this._data.prefs.energy_sources[0].flow_from[0].number_offset_percentage;
    // eslint-disable-next-line no-console
    console.log({ data_offset });



    return html` <ha-card>
      ${this._config.title
        ? html`<h1 class="card-header">${this._config.title}</h1>`
        : ""}
      <div class="mdc-data-table">
        <div class="mdc-data-table__table-container">
          <table class="mdc-data-table__table" aria-label="Energy emissions">
            <thead>
              <tr class="mdc-data-table__header-row">
                <th class="mdc-data-table__header-cell"></th>
                <th
                  class="mdc-data-table__header-cell"
                  role="columnheader"
                  scope="col"
                >
                  ${this.hass.localize(
                    "ui.panel.lovelace.cards.energy.energy_emissions_table.source"
                  )}
                </th>
                <th
                  class="mdc-data-table__header-cell mdc-data-table__header-cell--numeric"
                  role="columnheader"
                  scope="col"
                >
                  ${this.hass.localize(
                    "ui.panel.lovelace.cards.energy.energy_emissions_table.emissions"
                  )}
                </th>
              </tr>
            </thead>
            <tbody class="mdc-data-table__content">
<tr class="mdc-data-table__row">
                  <td class="mdc-data-table__cell cell-bullet">
                    <div
                      class="bullet"
                      style=${styleMap({
                        borderColor: borderColorEmissionsElectricity,
                        backgroundColor: borderColorEmissionsElectricity + "7F",
                      })}
                    ></div>
                  </td>
                  <th class="mdc-data-table__cell" scope="row">
                  ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.electricity_emissions"
                      )}
                  </th>
                  <td
                    class="mdc-data-table__cell mdc-data-table__cell--numeric"
                  >
                    ${formatNumber(electricityEmissions, this.hass.locale)} kgCO2Eq
                  </td>
                </tr>

                <tr class="mdc-data-table__row">
                    <td class="mdc-data-table__cell cell-bullet">
                      <div
                        class="bullet"
                        style=${styleMap({
                          borderColor: borderColorOffsetsElectricity,
                          backgroundColor: borderColorOffsetsElectricity + "7F",
                        })}
                      ></div>
                    </td>
                    <th class="mdc-data-table__cell" scope="row">
                    ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.electricity_offsets"
                      )}
                    </th>
                    <td
                      class="mdc-data-table__cell mdc-data-table__cell--numeric"
                    >
                      ${formatNumber(electricityOffsets, this.hass.locale)} kgCO2Eq
                    </td>
                  </tr>
                  
                <tr class="mdc-data-table__row">
                    <td class="mdc-data-table__cell cell-bullet">
                      <div
                        class="bullet"
                        style=${styleMap({
                          borderColor: borderColorAvoidedElectricity,
                          backgroundColor: borderColorAvoidedElectricity + "7F",
                        })}
                      ></div>
                    </td>
                    <th class="mdc-data-table__cell" scope="row">
                    ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.electricity_avoided"
                      )}
                    </th>
                    <td
                      class="mdc-data-table__cell mdc-data-table__cell--numeric"
                    >
                      ${formatNumber(electricityAvoided, this.hass.locale)} kgCO2Eq
                    </td>
                  </tr>

                  <tr class="mdc-data-table__row">
                  <td class="mdc-data-table__cell cell-bullet">
                    <div
                      class="bullet"
                      style=${styleMap({
                        borderColor: borderColorEmissionsGas,
                        backgroundColor: borderColorEmissionsGas + "7F",
                      })}
                    ></div>
                  </td>
                  <th class="mdc-data-table__cell" scope="row">
                  ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.gas_emissions"
                      )}
                  </th>
                  <td
                    class="mdc-data-table__cell mdc-data-table__cell--numeric"
                  >
                    ${formatNumber(gasEmissions, this.hass.locale)} kgCO2Eq
                  </td>
                </tr>

                <tr class="mdc-data-table__row">
                    <td class="mdc-data-table__cell cell-bullet">
                      <div
                        class="bullet"
                        style=${styleMap({
                          borderColor: borderColorOffsetsGas,
                          backgroundColor: borderColorOffsetsGas + "7F",
                        })}
                      ></div>
                    </td>
                    <th class="mdc-data-table__cell" scope="row">
                    ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.gas_offsets"
                      )}
                    </th>
                    <td
                      class="mdc-data-table__cell mdc-data-table__cell--numeric"
                    >
                      ${formatNumber(gasOffsets, this.hass.locale)} kgCO2Eq
                    </td>
                  </tr>
              
                  <tr class="mdc-data-table__row total">
                    <td class="mdc-data-table__cell"></td>
                    <th class="mdc-data-table__cell" scope="row">
                      ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.absolute_emissions"
                      )}
                    </th>
                    <td
                      class="mdc-data-table__cell mdc-data-table__cell--numeric"
                    >
                      ${formatNumber(absoluteEmissions, this.hass.locale)} kgCO2Eq
                    </td>
                  </tr>
              
                <tr class="mdc-data-table__row total">
                    <td class="mdc-data-table__cell"></td>
                    <th class="mdc-data-table__cell" scope="row">
                      ${this.hass.localize(
                        "ui.panel.lovelace.cards.energy.energy_emissions_table.net_emissions"
                      )}
                    </th>
                    <td
                      class="mdc-data-table__cell mdc-data-table__cell--numeric"
                    >
                      ${formatNumber(netEmissions, this.hass.locale)} kgCO2Eq
                    </td>
                  </tr>

            </tbody>
          </table>
        </div>
      </div>
    </ha-card>`;
  }

  static get styles(): CSSResultGroup {
    return css`
      ${unsafeCSS(dataTableStyles)}
      .mdc-data-table {
        width: 100%;
        border: 0;
      }
      .mdc-data-table__header-cell,
      .mdc-data-table__cell {
        color: var(--primary-text-color);
        border-bottom-color: var(--divider-color);
      }
      .mdc-data-table__row:not(.mdc-data-table__row--selected):hover {
        background-color: rgba(var(--rgb-primary-text-color), 0.04);
      }
      .total {
        --mdc-typography-body2-font-weight: 500;
      }
      .total .mdc-data-table__cell {
        border-top: 1px solid var(--divider-color);
      }
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
      .cell-bullet {
        width: 32px;
        padding-right: 0;
      }
      .bullet {
        border-width: 1px;
        border-style: solid;
        border-radius: 4px;
        height: 16px;
        width: 32px;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-energy-carbon-emissions-table-card": HuiEnergyCarbonEmissionsTableCard;
  }
}
